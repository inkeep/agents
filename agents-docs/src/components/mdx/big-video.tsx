interface BigVideoProps {
  src: string;
  maxWidth?: string;
  height?: string;
}

export function BigVideo({ src, height = 'auto' }: BigVideoProps) {
  return (
    // biome-ignore lint/a11y/useMediaCaption: ignore `.vtt` captions
    <video
      src={src}
      controls
      style={{
        borderRadius: '10px',
        display: 'block',
        maxWidth: '800px',
        width: '100%',
        height,
        margin: '0 auto',
      }}
    >
      Your browser does not support the video tag.
    </video>
  );
}
