import { AlertCircle } from 'lucide-react';
import { formatDate } from '@/app/utils/format-date';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ExpirationIndicatorProps {
  expiresAt: string | undefined;
}

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const expiryDate = new Date(expiresAt);
  const now = new Date();
  return expiryDate.getTime() < now.getTime();
}

function isExpiringInLessThan24Hours(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const expiryDate = new Date(expiresAt);
  const now = new Date();
  const hoursUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
  return hoursUntilExpiry <= 24 && hoursUntilExpiry >= 0;
}

function isExpiringSoon(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const expiryDate = new Date(expiresAt);
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
}

export function ExpirationIndicator({ expiresAt }: ExpirationIndicatorProps) {
  // Show expiration date for non-expired keys
  const showExpirationDate = !isExpired(expiresAt);

  // Determine which indicator to show (most urgent takes precedence)
  const expired = isExpired(expiresAt);
  const criticallyExpiring = isExpiringInLessThan24Hours(expiresAt) && !expired;
  const expiringSoon = isExpiringSoon(expiresAt) && !criticallyExpiring && !expired;

  return (
    <div className="flex items-center gap-2">
      {showExpirationDate && (
        <span className="text-sm text-muted-foreground">
          {expiresAt ? formatDate(expiresAt) : 'Never'}
        </span>
      )}

      {expired && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="error">Expired</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This API key expired on {expiresAt ? formatDate(expiresAt) : ''}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {criticallyExpiring && (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Expires in less than 24 hours</p>
          </TooltipContent>
        </Tooltip>
      )}

      {expiringSoon && (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Expires in less than 7 days</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
