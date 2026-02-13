'use client';

import type { WorkAppId } from '../types';

interface WorkAppIconProps {
  appId: WorkAppId;
  className?: string;
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 62 62" fill="none" aria-label="Slack">
      <title>Slack</title>
      <path
        d="M18.274 36.795c0 2.556-2.065 4.621-4.621 4.621a4.62 4.62 0 1 1 0-9.242h4.621v4.621zm2.31 0a4.62 4.62 0 1 1 9.242 0v11.552c0 2.556-2.065 4.621-4.621 4.621s-4.621-2.065-4.621-4.621V36.795z"
        fill="#e01e5a"
      />
      <path
        d="M25.208 18.242c-2.556 0-4.621-2.065-4.621-4.621a4.62 4.62 0 1 1 9.242 0v4.621h-4.621zm0 2.345a4.62 4.62 0 1 1 0 9.242H13.621C11.065 29.829 9 27.764 9 25.208a4.62 4.62 0 0 1 4.621-4.621h11.587z"
        fill="#36c5f0"
      />
      <path
        d="M43.724 25.208a4.62 4.62 0 1 1 9.242 0 4.62 4.62 0 0 1-4.621 4.621h-4.621v-4.621zm-2.31 0a4.62 4.62 0 0 1-4.621 4.621c-2.556 0-4.621-2.065-4.621-4.621V13.621a4.62 4.62 0 1 1 9.242 0v11.587z"
        fill="#2eb67d"
      />
      <path
        d="M36.792 43.726a4.62 4.62 0 1 1 0 9.242c-2.556 0-4.621-2.065-4.621-4.621v-4.621h4.621zm0-2.31c-2.556 0-4.621-2.065-4.621-4.621a4.62 4.62 0 0 1 4.621-4.621h11.587a4.62 4.62 0 1 1 0 9.242H36.792z"
        fill="#ecb22e"
      />
    </svg>
  );
}

export const GithubIcon = ({ className }: { className?: string }) => {
  return (
    <svg className={className} viewBox="0 0 62 62" fill="none" aria-label="Github">
      <title>Github</title>
      <rect width="62" height="62" rx="31" fill="#fff" />
      <g clip-path="url(#A)">
        <path
          fill-rule="evenodd"
          d="M30.934 9C18.805 9 9 18.878 9 31.097c0 9.768 6.283 18.036 14.998 20.963 1.09.22 1.489-.475 1.489-1.06l-.036-4.098c-6.102 1.317-7.372-2.634-7.372-2.634-.981-2.561-2.434-3.219-2.434-3.219-1.997-1.354.146-1.354.146-1.354 2.215.146 3.378 2.268 3.378 2.268 1.961 3.365 5.12 2.415 6.391 1.829.181-1.427.763-2.415 1.38-2.963-4.867-.512-9.987-2.415-9.987-10.903 0-2.415.871-4.39 2.251-5.927-.218-.549-.981-2.817.218-5.854 0 0 1.852-.585 6.028 2.268 1.788-.484 3.632-.73 5.484-.732s3.74.256 5.483.732c4.176-2.854 6.029-2.268 6.029-2.268 1.199 3.036.435 5.305.218 5.854 1.417 1.536 2.252 3.512 2.252 5.927 0 8.488-5.12 10.354-10.023 10.903.799.695 1.489 2.012 1.489 4.097l-.036 6.073c0 .586.4 1.281 1.489 1.061 8.716-2.927 14.998-11.195 14.998-20.963C52.868 18.878 43.027 9 30.934 9z"
          fill="#24292f"
        />
      </g>
      <defs>
        <clipPath id="A">
          <path fill="#fff" transform="translate(9 9)" d="M0 0h44v43.102H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export function WorkAppIcon({ appId, className = 'h-5 w-5' }: WorkAppIconProps) {
  switch (appId) {
    case 'slack':
      return <SlackIcon className={className} />;
    case 'github':
      return <GithubIcon className={className} />;
  }
}
