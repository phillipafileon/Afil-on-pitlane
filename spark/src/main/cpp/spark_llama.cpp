#include <jni.h>
#include "llama.h"
#include <algorithm>
#include <mutex>
#include <thread>
#include <string>
#include <vector>

static std::once_flag g_backend;
// Retain model weights between turns. Re-loading hundreds of MB for every reply was
// SPARK v0.2's largest avoidable source of latency.
static std::mutex g_infer_mutex;
static llama_model *g_model = nullptr;
static std::string g_model_path;
static void unload_model() {
    if (g_model) llama_model_free(g_model);
    g_model = nullptr;
    g_model_path.clear();
}
static bool load_model_if_needed(const std::string &path) {
    if (g_model && g_model_path == path) return true;
    unload_model();
    llama_model_params mp=llama_model_default_params();
    mp.n_gpu_layers=0; // offline CPU execution without GPU driver dependency
    g_model=llama_model_load_from_file(path.c_str(),mp);
    if (!g_model) return false;
    g_model_path=path;
    return true;
}
static std::string infer(const std::string &path,const std::string &prompt,int limit) {
    std::lock_guard<std::mutex> lock(g_infer_mutex);
    std::call_once(g_backend,[]{llama_backend_init();});
    if (!load_model_if_needed(path))
        return "Couldn't load this GGUF model. Try the recommended Qwen3 0.6B Q4_0.";
    llama_model *model=g_model;
    const llama_vocab *vocab=llama_model_get_vocab(model);
    int size=-llama_tokenize(vocab,prompt.c_str(),(int)prompt.size(),nullptr,0,true,true);
    if(size<1||size>1800){return "Prompt too long for the phone model.";}
    std::vector<llama_token> tokens(size);
    if(llama_tokenize(vocab,prompt.c_str(),(int)prompt.size(),tokens.data(),size,true,true)<0){
        return "Model cannot tokenize this prompt.";
    }
    int budget=std::clamp(limit,1,160);
    llama_context_params cp=llama_context_default_params();
    cp.n_ctx=std::max(1024,((size+budget+31)/32)*32);
    cp.n_batch=cp.n_ctx;
    cp.n_threads=std::min(4,(int)std::max(1u,std::thread::hardware_concurrency()));
    llama_context *ctx=llama_init_from_model(model,cp);
    if(!ctx){return "Not enough free memory to run this GGUF model.";}
    llama_sampler *sampler=llama_sampler_chain_init(llama_sampler_chain_default_params());
    // Qwen3 non-thinking recommendations; less repetitive than greedy sampling.
    llama_sampler_chain_add(sampler,llama_sampler_init_top_k(20));
    llama_sampler_chain_add(sampler,llama_sampler_init_top_p(0.8f,1));
    llama_sampler_chain_add(sampler,llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(sampler,llama_sampler_init_dist(77));
    llama_batch_ext *batch=llama_batch_ext_init(ctx);
    llama_batch_ext_clear(batch);
    for(int i=0;i<size;i++){
        int index=llama_batch_ext_add_token(batch,0,tokens[i]);
        llama_pos pos=i;
        llama_batch_ext_set_pos(batch,index,&pos);
    }
    llama_batch_ext_set_output_logits(batch,size-1,true);
    std::string answer;
    for(int i=0;i<budget;i++){
        if(llama_process(ctx,LLAMA_PROCESS_TYPE_DECODE,batch))break;
        llama_token sampled=llama_sampler_sample(sampler,ctx,-1);
        if(llama_vocab_is_eog(vocab,sampled))break;
        char piece[1024];int n=llama_token_to_piece(vocab,sampled,piece,sizeof(piece),0,true);
        if(n>0)answer.append(piece,n);
        llama_batch_ext_clear(batch);
        int index=llama_batch_ext_add_token(batch,0,sampled);
        llama_pos pos=size+i;
        llama_batch_ext_set_pos(batch,index,&pos);
        llama_batch_ext_set_output_logits(batch,index,true);
    }
    llama_batch_ext_free(batch);
    llama_sampler_free(sampler);
    llama_free(ctx);
    return answer;
}
extern "C" JNIEXPORT jstring JNICALL
Java_uk_co_afileonmotorsport_spark_LocalLlama_generate(JNIEnv *env,jclass,jstring path,jstring prompt,jint tokens){
    if(!path||!prompt)return env->NewStringUTF("Invalid input");
    const char *p=env->GetStringUTFChars(path,nullptr);
    const char *q=env->GetStringUTFChars(prompt,nullptr);
    std::string filename(p),question(q);
    env->ReleaseStringUTFChars(path,p);
    env->ReleaseStringUTFChars(prompt,q);
    std::string output=infer(filename,question,tokens);
    return env->NewStringUTF(output.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_uk_co_afileonmotorsport_spark_LocalLlama_unload(JNIEnv *,jclass){
    std::lock_guard<std::mutex> lock(g_infer_mutex);
    unload_model();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_uk_co_afileonmotorsport_spark_LocalLlama_preload(JNIEnv *env,jclass,jstring path){
    if (!path) return JNI_FALSE;
    const char *p=env->GetStringUTFChars(path,nullptr);
    std::string filename(p);
    env->ReleaseStringUTFChars(path,p);
    std::lock_guard<std::mutex> lock(g_infer_mutex);
    std::call_once(g_backend,[]{llama_backend_init();});
    return load_model_if_needed(filename) ? JNI_TRUE : JNI_FALSE;
}
