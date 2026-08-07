package com.reorderable

import com.facebook.react.bridge.ReadableArray
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

  @ReactProp(name = "mode")
  override fun setMode(view: ReorderableView?, value: String?) = Unit

  @ReactProp(name = "entryKinds")
  override fun setEntryKinds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "entryIds")
  override fun setEntryIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "collectionIds")
  override fun setCollectionIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "parentEntryIds")
  override fun setParentEntryIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "orderedEntryIds")
  override fun setOrderedEntryIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "selectedIds")
  override fun setSelectedIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "acceptedDropZoneIds")
  override fun setAcceptedDropZoneIds(view: ReorderableView?, value: ReadableArray?) = Unit

  @ReactProp(name = "layoutRevision")
  override fun setLayoutRevision(view: ReorderableView?, value: String?) = Unit

  @ReactProp(name = "enabled")
  override fun setEnabled(view: ReorderableView?, value: Boolean) = Unit

  override fun cancelInteraction(view: ReorderableView) = Unit

  override fun debugBeginInteraction(view: ReorderableView) = Unit

  override fun debugEmitTerminalReorder(
    view: ReorderableView,
    sourceIdsJson: String,
    destinationCollectionId: String,
    destinationBeforeId: String
  ) = Unit

  override fun debugBeginDrop(view: ReorderableView, activatedId: String) = Unit

  override fun debugTargetDrop(view: ReorderableView, destinationId: String) = Unit

  override fun debugEmitTerminalDrop(view: ReorderableView, outside: Boolean) = Unit

  companion object {
    const val NAME = "ReorderableView"
  }
}
