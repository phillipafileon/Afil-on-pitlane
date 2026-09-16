package uk.co.afileonmotorsport.pitlane;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.util.AttributeSet;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

/**
 * WebView configured to preserve Afiléon's authored colours exactly.
 *
 * Some Android/WebView combinations can algorithmically darken web content when
 * the host app is using a dark theme. Pitlane already supplies its own dark
 * palette, so that processing only desaturates the yellow/cyan/magenta and
 * dulls the white text. Disable it here so the app matches the website.
 */
public class VividWebView extends WebView {

    public VividWebView(Context context) {
        super(context);
        initVividColours();
    }

    public VividWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        initVividColours();
    }

    public VividWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        initVividColours();
    }

    private void initVividColours() {
        setBackgroundColor(Color.rgb(2, 7, 17));
        WebSettings settings = getSettings();

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
    }
}
