import { Box, Heading, P } from '@a-type/ui';
import { TranslationRecommendations } from './TranslationRecommendations';

export function Introduction() {
  return (
    <Box p col gap="lg">
      <Heading>Welcome to the Margins</Heading>
      <P>
        Margins Bible is a great little Bible app, and a community built around
        reinterpreting and reclaiming the Christian scriptures for those who
        don't feel entirely at home in Christianity.
      </P>
      <TranslationRecommendations />
    </Box>
  );
}
