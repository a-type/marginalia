import { loginFn } from '#/lib/auth/functions';
import { m } from '#/paraglide/messages';
import { Dialog, FormikForm, SubmitButton, TextField } from '@a-type/ui';
import { useServerFn } from '@tanstack/react-start';

export interface LoginDialogProps {
  open?: boolean;
  setOpen?: (value: boolean) => void;
}

export function LoginDialog({ open, setOpen }: LoginDialogProps) {
  const login = useServerFn(loginFn);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Content>
        <Dialog.Title>{m.legal_cool_snail_taste()}</Dialog.Title>
        <Dialog.Description>{m.extra_happy_hare_blink()}</Dialog.Description>
        <FormikForm
          initialValues={{
            handle: '',
          }}
          onSubmit={async ({ handle }) => {
            await login({ data: { identifier: handle } });
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
