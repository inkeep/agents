'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ProviderIcon } from '../icons/provider-icon';

interface MCPToolImageProps {
  imageUrl?: string;
  name: string;
  size?: number;
  className?: string;
}

export function MCPToolImage({ imageUrl, name, size = 24, className }: MCPToolImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  if (!imageUrl || imageError) {
    return <ProviderIcon provider={name} size={size} className={className} />;
  }

  // Handle base64 images
  if (imageUrl.startsWith('data:image/')) {
    return (
      <Image
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={cn('object-contain', className)}
        onError={() => setImageError(true)}
      />
    );
  }

  // Handle regular URLs with Next.js Image component for optimization
  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {imageLoading && <ProviderIcon provider={name} size={size} className="absolute inset-0" />}
      <Image
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={cn(
          'object-contain transition-opacity duration-200',
          imageLoading ? 'opacity-0' : 'opacity-100'
        )}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
        onLoad={() => setImageLoading(false)}
        unoptimized // For external URLs
      />
    </div>
  );
}
