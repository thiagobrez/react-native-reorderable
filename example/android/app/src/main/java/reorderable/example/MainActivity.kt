package reorderable.example

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import org.json.JSONObject

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    dispatchDebugAccessibilityAction(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    dispatchDebugAccessibilityAction(intent)
  }

  private fun dispatchDebugAccessibilityAction(intent: Intent?) {
    if (!BuildConfig.DEBUG) return
    val url = intent?.data ?: return
    val eventName = if (url.path == "/perform-accessibility-action") {
      "perform-accessibility-action"
    } else {
      url.getQueryParameter("name")
    }
    if (url.host != "agent-device" || eventName != "perform-accessibility-action") return
    val payload = runCatching {
      JSONObject(url.getQueryParameter("payload") ?: return)
    }.getOrNull() ?: return
    val itemLabel = payload.optString("itemLabel").takeIf { it.isNotEmpty() } ?: return
    val actionLabel = payload.optString("actionLabel").takeIf { it.isNotEmpty() } ?: return
    val containerId = payload.optString("containerId").takeIf { it.isNotEmpty() } ?: return
    sendBroadcast(
      Intent("com.reorderable.DEBUG_PERFORM_ACCESSIBILITY_ACTION")
        .setPackage(packageName)
        .putExtra("itemLabel", itemLabel)
        .putExtra("actionLabel", actionLabel)
        .putExtra("containerId", containerId)
    )
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ReorderableExample"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
