import { m } from '#/paraglide/messages';
import {
  Box,
  Button,
  Card,
  Dialog,
  Heading,
  Icon,
  P,
  Progress,
  Text,
} from '@a-type/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { builtinTranslations } from '../../lib/bible/manifests';
import { downloadTranslation } from '../../lib/bible/translation-jobs';
import { translationsQueryOptions } from '../../queries/translations';
import { useAddReadingTab } from '../app/readingTabs';
import { TranslationManagerDialog } from '../settings/TranslationManagerDialog';

export function TranslationRecommendations() {
  const addTab = useAddReadingTab();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<{
    id: string;
    title: string;
  }>();
  const translations = useQuery(translationsQueryOptions);
  const download = useMutation({
    networkMode: 'always',
    mutationFn: (translation: { id: string; title: string }) =>
      downloadTranslation(translation.id),
    onSuccess: (_, translation) => {
      setSelected(undefined);
      addTab({
        translation: translation.id,
        book: 'MAT',
        chapter: 1,
      });
    },
  });
  const selectedRecord = translations.data?.find(
    (translation) => translation.id === selected?.id,
  );
  const preparing =
    selectedRecord?.sourceStatus === 'ready' &&
    selectedRecord.searchStatus !== 'ready';
  const status =
    selectedRecord?.sourceStatus === 'error'
      ? m.translation_error()
      : selectedRecord?.sourceStatus === 'ready'
        ? preparing
          ? m.translation_preparing()
          : m.translation_downloaded()
        : m.translation_downloading();
  const downloadError = download.error?.message || selectedRecord?.error;

  const selectTranslation = (translation: { id: string; title: string }) => {
    setSelected(translation);
    download.mutate(translation);
  };

  return (
    <Box col gap>
      <Heading emphasis="ambient">Pick a Bible</Heading>
      <P emphasis="ambient">
        For simplicity (and expedience) we rely on freely available
        translations. Here are some good English starters. Or, browse the whole
        catalog.
      </P>
      <Box gap col>
        {builtinTranslations.map((translation) => (
          <Card key={translation.id}>
            <Card.Main
              onClick={() => {
                selectTranslation(translation);
              }}
            >
              <Card.Title>{translation.title}</Card.Title>
              <Card.Content>
                <Text emphasis="secondary">{translation.description}</Text>
              </Card.Content>
            </Card.Main>
          </Card>
        ))}
        <Button emphasis="ghost" onClick={() => setIsDialogOpen(true)}>
          <Icon name="book" /> Browse Catalog
        </Button>
        <TranslationManagerDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSelect={(translation) => {
            setIsDialogOpen(false);
            selectTranslation(translation);
          }}
        />
      </Box>
      <Dialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open && !download.isPending) setSelected(undefined);
        }}
      >
        {selected && (
          <Dialog.Content width="sm" disableDefaultClose={download.isPending}>
            <Dialog.Title>{selected.title}</Dialog.Title>
            <p role="status">{status}</p>
            {selectedRecord && (
              <Progress
                aria-label={status}
                value={
                  preparing
                    ? selectedRecord.prepared
                    : selectedRecord.downloaded
                }
                max={selectedRecord.manifest.books.length}
              />
            )}
            {downloadError && (
              <div role="alert">
                <p>{downloadError}</p>
                <Button
                  size="small"
                  disabled={download.isPending}
                  onClick={() => download.mutate(selected)}
                >
                  {m.translation_retry()}
                </Button>
              </div>
            )}
            {!download.isPending && (
              <Dialog.Close>{m.annotation_cancel()}</Dialog.Close>
            )}
          </Dialog.Content>
        )}
      </Dialog>
    </Box>
  );
}
