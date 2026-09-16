package uk.co.afileonmotorsport.pitlane;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.widget.FrameLayout;

/**
 * Very brief branded boot overlay. It appears only when the Activity is created,
 * stays visible for a fraction of a second, then gets out of the way completely.
 */
public class BootSplashView extends FrameLayout {
    private static final long HOLD_MS = 420L;
    private static final long FADE_MS = 100L;

    private final Runnable dismissSplash = () ->
            animate()
                    .alpha(0f)
                    .setDuration(FADE_MS)
                    .withEndAction(() -> {
                        setVisibility(View.GONE);
                        setClickable(false);
                    })
                    .start();

    public BootSplashView(Context context) {
        super(context);
        init();
    }

    public BootSplashView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public BootSplashView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        setAlpha(1f);
        setVisibility(View.VISIBLE);
        setClickable(true);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        removeCallbacks(dismissSplash);
        setAlpha(1f);
        setVisibility(View.VISIBLE);
        postDelayed(dismissSplash, HOLD_MS);
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(dismissSplash);
        animate().cancel();
        super.onDetachedFromWindow();
    }
}
