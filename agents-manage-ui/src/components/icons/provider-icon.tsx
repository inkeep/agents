'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { IconComponentProps } from '@/components/ui/svg-icon';

interface ProviderIconProps extends Omit<IconComponentProps, 'children'> {
  provider: string;
  /**
   * Custom fallback to use when SVG fails to load
   * If not provided, will show nothing
   */
  fallback?: React.ReactNode;
}

/**
 * Get the local provider icon URL from assets
 */
const getLocalIconUrl = (provider: string): string => {
  const normalizedProvider = provider.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  // Note: In Next.js, files in src/assets need to be imported or moved to public/
  // For now, we'll assume they're in public/assets/provider-icons/
  return `/assets/provider-icons/${normalizedProvider}.svg`;
};

/**
 * Create a simple text-based fallback icon using the first character
 */
const createTextFallback = (provider: string, size: string | number): React.ReactNode => {
  const firstChar = provider.charAt(0);
  const numericSize = typeof size === 'string' ? Number.parseInt(size, 10) || 20 : size;
  const fontSize = Math.max(8, Math.floor(numericSize * 0.6)); // Scale font size with icon size

  return (
    <div
      className="rounded-sm bg-gray-100 dark:bg-muted/50 text-muted-foreground font-medium flex items-center justify-center"
      style={{
        width: size,
        height: size,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
      }}
    >
      {firstChar}
    </div>
  );
};

export function ProviderIcon({
  provider,
  fallback = false,
  className,
  size = 20,
}: ProviderIconProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const iconUrl = getLocalIconUrl(provider);

  return (
    <div
      className={`inline-flex items-center justify-center relative ${className || ''}`}
      style={{ width: size, height: size }}
    >
      {/* Show fallback only on error */}
      {imageError && (
        <div className="absolute">{fallback || createTextFallback(provider, size)}</div>
      )}

      <Image
        key={provider}
        src={iconUrl}
        alt={`${provider} icon`}
        width={typeof size === 'string' ? Number.parseInt(size, 10) || 20 : size}
        height={typeof size === 'string' ? Number.parseInt(size, 10) || 20 : size}
        onLoad={() => {
          setImageLoaded(true);
        }}
        onError={() => {
          setImageError(true);
        }}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          opacity: imageLoaded && !imageError ? 1 : 0,
        }}
        unoptimized // For local SVG files
      />
    </div>
  );
}
