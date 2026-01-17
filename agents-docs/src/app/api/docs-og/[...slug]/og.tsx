import type { ImageResponseOptions } from 'next/dist/compiled/@vercel/og/types';
import { ImageResponse } from 'next/og';
import type { ReactElement, ReactNode } from 'react';

interface GenerateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  primaryTextColor?: string;
  site?: ReactNode;
  logo?: ReactNode;
  backgroundImageUrl: string;
}

export function generateOGImage(options: GenerateProps & ImageResponseOptions): ImageResponse {
  const { title, description, icon, site, primaryTextColor, logo, backgroundImageUrl, ...rest } =
    options;

  return new ImageResponse(
    generate({
      title,
      description,
      icon,
      site,
      primaryTextColor,
      logo,
      backgroundImageUrl,
    }),
    {
      width: 1200,
      height: 630,
      ...rest,
    }
  );
}

function generate({
  primaryTextColor = '#ffffff',
  backgroundImageUrl,
  ...props
}: GenerateProps): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        color: '#ffffff',
        position: 'relative',
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '4rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          {props.logo}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              color: primaryTextColor,
            }}
          >
            {props.icon}
            <p
              style={{
                fontSize: '1.5rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontFamily: 'JetBrains Mono',
                marginBottom: '0px',
              }}
            >
              {props.site}
            </p>
          </div>

          <p
            style={{
              fontWeight: 400,
              fontSize: '4.5rem',
              letterSpacing: '-1.5px',
              lineHeight: 1,
            }}
          >
            {props.title}
          </p>
          {props.description && (
            <p
              style={{
                fontSize: '1.75rem',
                color: '#ffffff',
                marginTop: '24px',
              }}
            >
              {props.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
