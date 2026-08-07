package com.reorderable

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.AttributeSet
import android.view.View
import android.view.ViewGroup

class ReorderableView : View {
  constructor(context: Context?) : super(context)
  constructor(context: Context?, attrs: AttributeSet?) : super(context, attrs)
  constructor(context: Context?, attrs: AttributeSet?, defStyleAttr: Int) : super(
    context,
    attrs,
    defStyleAttr
  )

  private var receiverRegistered = false
  private var debugAccessibilityContainerId: String? = null
  private val accessibilityActionReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val itemLabel = intent?.getStringExtra("itemLabel") ?: return
      val actionLabel = intent.getStringExtra("actionLabel") ?: return
      val containerId = intent.getStringExtra("containerId") ?: return
      if (containerId != debugAccessibilityContainerId) return
      debugPerformAccessibilityAction(itemLabel, actionLabel)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    updateAccessibilityActionReceiver()
  }

  fun setDebugAccessibilityContainerId(value: String?) {
    debugAccessibilityContainerId = value?.takeIf { it.isNotEmpty() }
    if (isAttachedToWindow) updateAccessibilityActionReceiver()
  }

  private fun updateAccessibilityActionReceiver() {
    if (!BuildConfig.DEBUG) return
    if (debugAccessibilityContainerId == null) {
      unregisterAccessibilityActionReceiver()
      return
    }
    if (receiverRegistered) return
    val filter = IntentFilter(DEBUG_ACCESSIBILITY_ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(
        accessibilityActionReceiver,
        filter,
        Context.RECEIVER_NOT_EXPORTED
      )
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(accessibilityActionReceiver, filter)
    }
    receiverRegistered = true
  }

  override fun onDetachedFromWindow() {
    unregisterAccessibilityActionReceiver()
    super.onDetachedFromWindow()
  }

  private fun unregisterAccessibilityActionReceiver() {
    if (!receiverRegistered) return
    context.unregisterReceiver(accessibilityActionReceiver)
    receiverRegistered = false
  }

  fun debugPerformAccessibilityAction(itemLabel: String, actionLabel: String) {
    if (!BuildConfig.DEBUG) return
    val target = findAccessibilityView(rootView, itemLabel) ?: return
    val action = target.createAccessibilityNodeInfo().actionList.firstOrNull {
      it.label?.toString() == actionLabel
    } ?: return
    target.performAccessibilityAction(action.id, null)
  }

  private fun findAccessibilityView(view: View, label: String): View? {
    if (view.contentDescription?.toString() == label) return view
    if (view !is ViewGroup) return null
    for (index in 0 until view.childCount) {
      val match = findAccessibilityView(view.getChildAt(index), label)
      if (match != null) return match
    }
    return null
  }

  companion object {
    const val DEBUG_ACCESSIBILITY_ACTION =
      "com.reorderable.DEBUG_PERFORM_ACCESSIBILITY_ACTION"
  }
}
