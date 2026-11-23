import { Button, clsx, Icon, Text, toast } from '@a-type/ui';
import { useDbClient, useLiveQuery } from '@tanstack/react-db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { m } from '#/paraglide/messages';
import type { VerseId } from '../../lib/bible/verse';
import { getHighlightCollections } from '../../lib/highlights/collections';
import { requestHighlightSync } from '../../lib/highlights/sync';
import { toggleHighlight } from '../../lib/highlights/toggle';
import { currentUserDidQueryOptions } from '../../queries/user';
import { InterlinearDialog } from '../bible/interlinear/InterlinearDialog';
import { annotationPaneActions } from './annotationPaneState';
import {
  useIsAnnotationPaneActive,
  usePrimarySelectedVerseId,
  useSetSelectedVerseId,
} from './annotationPaneStore';
import cls from './AnnotationToolbar.module.css';
import { useSelectedVerseIds } from './VerseSelection';

export function AnnotationToolbar({ className }: { className?: string }) {
  const selectedVerse = usePrimarySelectedVerseId();
  const selectedVerses = useSelectedVerseIds();
  const setSelectedVerse = useSetSelectedVerseId();
  const paneOpen = useIsAnnotationPaneActive();

  if (!selectedVerse || paneOpen) return null;

  return (
    <div className={clsx(cls.toolbar, className)}>
      <Button
        size="small"
        emphasis="ghost"
        aria-label="Deselect verse"
        onClick={() => setSelectedVerse()}
      >
        <Icon name="x" />
      </Button>
      <InterlinearDialog aria-label={m.interlinear_open()}>
        <Button.Icon>
          <Text bold>α</Text>
        </Button.Icon>
      </InterlinearDialog>
      <div className={cls.divider} />
      <HighlightButton verseId={selectedVerse} />
      <Button
        size="small"
        emphasis="ghost"
        aria-label="Add annotation"
        onClick={() => annotationPaneActions.openEditor(selectedVerses)}
      >
        <Icon name="chat" />
        <Text>Comment</Text>
      </Button>
    </div>
  );
}

function HighlightButton({ verseId }: { verseId: VerseId }) {
  const dbClient = useDbClient();
  const queryClient = useQueryClient();
  const { data: accountDid } = useQuery(currentUserDidQueryOptions);
  const { data: allHighlights, isLoading } = useLiveQuery(
    getHighlightCollections(dbClient).highlights,
  );
  const highlights = allHighlights?.filter(
    (highlight) => highlight.verseId === verseId,
  );
  const applied = highlights?.some(
    (highlight) =>
      highlight.status !== 'deleting' && highlight.status !== 'deleted',
  );
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      await toggleHighlight(dbClient, verseId);
      if (accountDid) {
        await requestHighlightSync(dbClient, accountDid);
        await queryClient.invalidateQueries({ queryKey: ['highlights'] });
      }
    },
    onError: () => {
      toast.error(m.highlight_save_error());
    },
  });

  return (
    <>
      <Button
        size="small"
        emphasis="ghost"
        aria-label={m.annotation_highlight_only()}
        toggled={!!applied}
        toggleMode="color"
        disabled={isLoading || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Icon name="highlighter" />
      </Button>
    </>
  );
}
