'use client';

import { Hammer } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ProviderIcon } from '../icons/provider-icon';

interface MCPToolImageProps {
  imageUrl?: string;
  name: string;
  provider?: string;
  size?: number;
  className?: string;
}

export function MCPToolImage({
  imageUrl,
  name,
  provider,
  size = 24,
  className,
}: MCPToolImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // If no imageUrl or image failed to load, show fallback
  if (!imageUrl || imageError) {
    if (provider) {
      return <ProviderIcon provider={provider} size={size} className={className} />;
    }
    return (
      <Hammer
        className={cn('text-muted-foreground', className)}
        style={{ width: size, height: size }}
      />
    );
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
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      {imageLoading && provider && (
        <ProviderIcon provider={provider} size={size} className="absolute inset-0" />
      )}
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
