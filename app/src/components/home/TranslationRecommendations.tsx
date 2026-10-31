import { Box, Button, Card, Heading, Icon, P, Text } from '@a-type/ui';
import { useState } from 'react';
import { builtinTranslations } from '../../lib/bible/manifests';
import { useAddReadingTab } from '../app/readingTabs';
import { TranslationManagerDialog } from '../settings/TranslationManagerDialog';

export function TranslationRecommendations() {
  const addTab = useAddReadingTab();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
                addTab({
                  translation: translation.id,
                  book: 'MAT',
                });
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
            addTab({
              translation: translation.id,
              book: 'MAT',
              chapter: 1,
            });
          }}
        />
      </Box>
    </Box>
  );
}
