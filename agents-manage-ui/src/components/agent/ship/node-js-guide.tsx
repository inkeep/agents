import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { DocsLink, Header } from './guide-header';

export function NodeJsGuide() {
  return (
    <div>
      <Header.Container>
        <Header.Title title="Node JS Guide" />
        <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/chat-api`} />
      </Header.Container>
    </div>
  );
}
