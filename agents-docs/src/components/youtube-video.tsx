interface YouTubeVideoProps {
    videoId: string;
    title?: string;
    caption?: string;
    aspectRatio?: '16:9' | '4:3' | '1:1';
    className?: string;
  }
  
  export function YouTubeVideo({ 
    videoId, 
    title = "YouTube Video", 
    caption,
    aspectRatio = '16:9',
    className = ""
  }: YouTubeVideoProps) {
    const paddingBottomMap = {
      '16:9': '56.25%',
      '4:3': '75%',
      '1:1': '100%'
    };
  
    const paddingBottom = paddingBottomMap[aspectRatio];
  
    return (
      <>
        <div 
          className={className}
          style={{ 
            position: "relative", 
            paddingBottom, 
            height: 0, 
            overflow: "hidden", 
            maxWidth: "100%", 
            marginBottom: caption ? "20px" : "30px" 
          }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              width: "100%", 
              height: "100%", 
              borderRadius: "10px" 
            }}
          />
        </div>
        {caption && (
          <p style={{ 
            textAlign: "center", 
            fontSize: "14px", 
            color: "#666", 
            marginTop: "-10px", 
            marginBottom: "20px" 
          }}>
            <em>{caption}</em>
          </p>
        )}
      </>
    );
  }