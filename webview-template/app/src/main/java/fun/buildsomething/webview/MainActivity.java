package fun.buildsomething.webview;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BSFWalletPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
