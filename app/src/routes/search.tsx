import { createFileRoute } from '@tanstack/react-router';

import { Box } from '@a-type/ui';
import { AppShell } from '../components/app/AppShell';
import { BibleSearch } from '../components/search/BibleSearch';
import {
  ensureSearchTranslation,
  validateBibleSearchParams,
} from '../components/search/searchParams';
import { readStoredTranslationId } from '../lib/bible/source';

export const Route = createFileRoute('/search')({
  ssr: false,
  validateSearch: validateBibleSearchParams,
  beforeLoad: ({ search }) => ensureSearchTranslation(search),
  loader: () => readStoredTranslationId(),
  component: SearchPage,
});

function SearchPage() {
  const translationId = Route.useLoaderData();

  return (
    <AppShell>
      <Box p full col overflow="clip">
        <BibleSearch initialTranslation={translationId} isActive />
      </Box>
    </AppShell>
  );
}
