package com.marting.rppg.sdk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class MobileRppgAcquisitionSdkPackage : ReactPackage {
    companion object {
        init {
            FrameProcessorPluginRegistry.addFrameProcessorPlugin("summarizeRppgFrame") { _, options ->
                RppgFrameSummaryPlugin(options)
            }
        }
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
