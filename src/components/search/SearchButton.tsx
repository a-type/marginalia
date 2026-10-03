import { m } from '#/paraglide/messages';
import { blueskyActorSearchQueryOptions } from '#/queries/social';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  Icon,
  Input,
  type ButtonProps,
} from '@a-type/ui';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FollowSuggestions } from '../auth/FollowSuggestions';
import { FollowButton } from './FollowButton';

export function SearchButton(props: ButtonProps) {
  return (
    <Dialog disableSheet>
      <Dialog.Trigger
        render={<Button emphasis="ghost" {...props} />}
        aria-label={m.antsy_sunny_iguana_dial()}
      >
        <Icon name="add_person" />
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>{m.awake_jumpy_racoon_absorb()}</Dialog.Title>
        <FollowSuggestions />
        <PersonSearch />
      </Dialog.Content>
    </Dialog>
  );
}

function PersonSearch() {
  const [rawPrefix, setPrefix] = useState('');
  const [prefix] = useDebouncedValue(rawPrefix, {
    wait: 300,
  });
  const suggestions = useQuery(blueskyActorSearchQueryOptions({ prefix }));

  return (
    <Box col gap full="width">
      <Input value={rawPrefix} onValueChange={setPrefix} className="w-full" />
      <Box col gap="sm" style={{ minHeight: '400px' }}>
        {suggestions.data?.actors.map((item) => (
          <Box items="center" gap key={item.did}>
            <FollowButton did={item.did} emphasis="light">
              {m.fancy_tough_ocelot_charm()}
            </FollowButton>
            <Avatar imageSrc={item.avatar} name={item.handle} />
            <span>{item.handle}</span>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
