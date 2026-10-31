import { Box, Checkbox, Field, useLocalStorage } from '@a-type/ui';

export function Rules() {
  const [rulesState, setRulesState] = useLocalStorage<Record<string, boolean>>(
    'margins:rulesAccepted',
    {},
  );

  return (
    <Box col gap>
      <Field horizontal>
        <Field.Control
          render={
            <Checkbox
              checked={rulesState.affirming || false}
              onCheckedChange={(checked) =>
                setRulesState({ ...rulesState, affirming: checked })
              }
            />
          }
        />
        <Field.Label>
          This is an open and affirming community. We don't tolerate
          discrimination or exclusion based on sexual orientation, gender
          identity, or any other personal characteristic.
        </Field.Label>
      </Field>
      <Field horizontal>
        <Field.Control
          render={
            <Checkbox
              checked={rulesState.engage || false}
              onCheckedChange={(checked) =>
                setRulesState({ ...rulesState, engage: checked })
              }
            />
          }
        />
        <Field.Label>
          Engage with the text! We're here to talk about the Bible. Annotations
          should relate to the verse, whether it's deep analysis or a joke.
        </Field.Label>
      </Field>
    </Box>
  );
}
