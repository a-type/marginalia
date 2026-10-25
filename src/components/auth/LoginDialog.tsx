import { login } from '#/lib/auth/functions';
import { m } from '#/paraglide/messages';
import {
  Button,
  Dialog,
  FormikForm,
  SubmitButton,
  TextField,
} from '@a-type/ui';
import { useEffect, useState } from 'react';

const lastLoginIdentifierStorageKey = 'margins:last-login-identifier';

function readLastLoginIdentifier() {
  try {
    return window.localStorage.getItem(lastLoginIdentifierStorageKey);
  } catch {
    return null;
  }
}

function storeLastLoginIdentifier(identifier: string) {
  try {
    window.localStorage.setItem(lastLoginIdentifierStorageKey, identifier);
  } catch {
    return;
  }
}

export interface LoginDialogProps {
  open?: boolean;
  setOpen?: (value: boolean) => void;
}

export function LoginDialog({ open, setOpen }: LoginDialogProps) {
  const [lastIdentifier, setLastIdentifier] = useState<string | null>(null);

  useEffect(() => {
    setLastIdentifier(readLastLoginIdentifier());
  }, []);

  const submitLogin = async (identifier: string) => {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) return;

    setLastIdentifier(normalizedIdentifier);
    storeLastLoginIdentifier(normalizedIdentifier);
    await login({ data: { identifier: normalizedIdentifier } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Content>
        <Dialog.Title>{m.legal_cool_snail_taste()}</Dialog.Title>
        <Dialog.Description>{m.extra_happy_hare_blink()}</Dialog.Description>
        {lastIdentifier ? (
          <Button
            type="button"
            onClick={() => void submitLogin(lastIdentifier)}
          >
            {m.login_continue_as({ handle: lastIdentifier })}
          </Button>
        ) : null}
        <FormikForm
          initialValues={{
            handle: '',
          }}
          onSubmit={async ({ handle }) => {
            await submitLogin(handle);
          }}
        >
          <TextField
            required
            name="handle"
            autoCapitalize="none"
            autoComplete="username"
            placeholder="alice.bsky.social"
            spellCheck={false}
          />
          <SubmitButton emphasis="primary" type="submit">
            {m.formal_bad_camel_advise()}
          </SubmitButton>
        </FormikForm>
      </Dialog.Content>
    </Dialog>
  );
}
