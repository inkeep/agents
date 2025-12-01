import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { FaGithub } from 'react-icons/fa6';

// async function getStars() {
//   if (process.env.NODE_ENV === 'development') {
//     return 747;
//   }
//
//   const response = await fetch('https://api.github.com/repos/inkeep/agents');
//   const json = await response.json();
//   return json.stargazers_count;
// }

export const GithubStars: FC = async () => {
  // const count = await getStars();
  const stars = 'Star' // new Intl.NumberFormat('en-US').format(stars)

  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href="https://github.com/inkeep/agents"
        target="_blank"
        rel="noreferrer"
        aria-label="Inkeep on GitHub"
      >
        <FaGithub />
        {stars}
      </a>
    </Button>
  );
};
