package com.reorderable

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ReorderableViewManagerInterface
import com.facebook.react.viewmanagers.ReorderableViewManagerDelegate

@ReactModule(name = ReorderableViewManager.NAME)
class ReorderableViewManager : SimpleViewManager<ReorderableView>(),
  ReorderableViewManagerInterface<ReorderableView> {
  private val mDelegate: ViewManagerDelegate<ReorderableView>

  init {
    mDelegate = ReorderableViewManagerDelegate(this)
  }

  override fun getDelegate(): ViewManagerDelegate<ReorderableView>? {
    return mDelegate
  }

  override fun getName(): String {
    return NAME
  }

  public override fun createViewInstance(context: ThemedReactContext): ReorderableView {
    return ReorderableView(context)
  }

  @ReactProp(name = "color")
  override fun setColor(view: ReorderableView?, color: Int?) {
    view?.setBackgroundColor(color ?: Color.TRANSPARENT)
  }

  companion object {
    const val NAME = "ReorderableView"
  }
}
