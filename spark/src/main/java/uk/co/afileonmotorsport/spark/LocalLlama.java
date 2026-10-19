package uk.co.afileonmotorsport.spark;

/** Calls the bundled llama.cpp runtime with a locally imported GGUF model. */
public final class LocalLlama {
    public static final boolean AVAILABLE;
    static {
        boolean loaded=false;
        try{System.loadLibrary("spark_llama");loaded=true;}
        catch(UnsatisfiedLinkError ignored){}
        AVAILABLE=loaded;
    }
    private LocalLlama(){}
    public static native String generate(String modelPath,String prompt,int tokens);
    public static native void unload();
}
