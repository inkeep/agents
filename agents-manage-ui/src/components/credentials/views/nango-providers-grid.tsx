'use client';

import type { ApiProvider } from '@nangohq/types';
import { Search } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ProviderIcon } from '@/components/icons/provider-icon';
import EmptyState from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { CardGrid } from '@/components/ui/card-grid';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NangoProvidersGridProps {
  providers: ApiProvider[];
  error: string | null;
}

export function NangoProvidersGrid({ providers, error }: NangoProvidersGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const renderProviderHeader = (provider: ApiProvider) => (
    <div className="flex items-center gap-3 overflow-hidden">
      <ProviderIcon provider={provider.name} size={20} className="flex-shrink-0" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <CardTitle className="text-sm font-medium leading-tight truncate flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {provider.display_name || provider.name}
            </CardTitle>
          </TooltipTrigger>
          <TooltipContent>
            <p>{provider.display_name || provider.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  const renderProviderContent = (provider: ApiProvider) => (
    <div className="pt-0">
      {/* Provider Categories */}
      {provider.categories && provider.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {provider.categories.slice(0, 1).map((category) => (
            <Badge key={category} variant="code" className="text-2xs uppercase border-0">
              {category}
            </Badge>
          ))}
          {provider.categories.length > 1 && (
            <Badge variant="code" className="text-2xs text-muted-foreground uppercase border-0">
              +{provider.categories.length - 1}
            </Badge>
          )}
        </div>
      )}
    </div>
  );

  // Pre-process searchable text for performance
  const providersWithSearchText = useMemo(() => {
    return providers.map((provider) => ({
      ...provider,
      searchText: [
        provider.name.toLowerCase(),
        provider.display_name?.toLowerCase() || '',
        ...(provider.categories?.map((cat) => cat.toLowerCase()) || []),
      ].join(' '),
    }));
  }, [providers]);

  // Filter providers based on search query (now efficient)
  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) {
      return providersWithSearchText;
    }

    const query = searchQuery.toLowerCase();
    return providersWithSearchText.filter((provider) => provider.searchText.includes(query));
  }, [providersWithSearchText, searchQuery]);

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search providers (e.g., slack, github, zendesk)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* No results */}
      {filteredProviders.length === 0 && searchQuery && (
        <EmptyState
          icon={<></>}
          title="No providers found."
          description={`No providers match "${searchQuery}". Try a different search term.`}
          action={
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear search
            </Button>
          }
        />
      )}

      {/* Provider grid */}
      {filteredProviders.length > 0 && (
        <CardGrid
          cardClassName="py-4 shadow-none rounded-lg"
          items={filteredProviders}
          getKey={(provider) => provider.name}
          getHref={(provider) =>
            `/${tenantId}/projects/${projectId}/credentials/new/providers/${encodeURIComponent(provider.name)}`
          }
          renderHeader={renderProviderHeader}
          renderContent={renderProviderContent}
          gridClassName="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        />
      )}
    </div>
  );
}
