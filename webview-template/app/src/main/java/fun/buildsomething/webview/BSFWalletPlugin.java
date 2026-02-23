package fun.buildsomething.webview;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BSFWallet Capacitor plugin — exposes Solana wallet operations to the WebView.
 *
 * Hackathon stub: returns mock data. Real implementation by @zeroxpunk
 * will integrate with Phantom/Solflare via Mobile Wallet Adapter (MWA).
 */
@CapacitorPlugin(name = "BSFWallet")
public class BSFWalletPlugin extends Plugin {

    @PluginMethod
    public void connect(PluginCall call) {
        // TODO: Real implementation uses MWA to connect to Phantom/Solflare
        JSObject ret = new JSObject();
        ret.put("publicKey", "StubWa11et1111111111111111111111111111111111");
        call.resolve(ret);
    }

    @PluginMethod
    public void signMessage(PluginCall call) {
        String message = call.getString("message", "");
        // TODO: Real implementation uses MWA signMessage
        JSObject ret = new JSObject();
        ret.put("signature", "stub-signature-for-" + message.substring(0, Math.min(10, message.length())));
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        // TODO: Real implementation disconnects MWA session
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
