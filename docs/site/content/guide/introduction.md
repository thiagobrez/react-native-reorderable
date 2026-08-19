# Introduction

React Native Reorderable provides controlled reorder and drag-and-drop for free-form children, virtualized lists, and section lists. It uses native SwiftUI reorder on iOS 27 when available and a Reanimated and Gesture Handler fallback on earlier iOS versions and Android.

The application owns its data and selection. The library handles the interaction, destination feedback, engine selection, and order reconciliation.

<div className="platform-demos">
  <figure>
    <video autoPlay loop muted playsInline controls preload="metadata" aria-label="Native reorder and drag and drop on iOS 27">
      <source src="/react-native-reorderable/videos/ios-27-drag-and-drop.mp4" type="video/mp4" />
    </video>
    <figcaption>iOS 27 · native reorder and drag-and-drop</figcaption>
  </figure>
  <figure>
    <video autoPlay loop muted playsInline controls preload="metadata" aria-label="Reorder and drag and drop on Android">
      <source src="/react-native-reorderable/videos/android-reorder.mp4" type="video/mp4" />
    </video>
    <figcaption>Android · fallback reorder and drag-and-drop</figcaption>
  </figure>
</div>

Continue to [Installation](./installation) to add the library to your project.
