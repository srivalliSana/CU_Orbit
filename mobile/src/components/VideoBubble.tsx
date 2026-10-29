import { VideoView, useVideoPlayer } from "expo-video";

// A separate component (not inlined in a parent) so useVideoPlayer — which
// must run unconditionally, same order every render — only mounts for rows
// that are actually a video, instead of needing a guard inside a hook.
// Shared by MessageBubble's video viewer and the shared-media gallery.
export default function VideoBubble({ uri, style, controls = true }: { uri: string; style: object; controls?: boolean }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={controls}
      fullscreenOptions={{ enable: controls }}
    />
  );
}
