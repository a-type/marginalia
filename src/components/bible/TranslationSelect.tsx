import { knownTranslations } from '#/lib/bible/manifests';
import { m } from '#/paraglide/messages';
import { translationsQueryOptions } from '#/queries/translations';
import { Select } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';
import cls from './TranslationSelect.module.css';

export function TranslationSelect({
  value,
  onValueChange,
  installedOnly = false,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  installedOnly?: boolean;
  disabled?: boolean;
}) {
  const translations = useQuery(translationsQueryOptions);
  const installed = (translations.data ?? []).filter(
    (record) => record.sourceStatus === 'ready',
  );
  const choices = [
    ...knownTranslations,
    ...installed
      .filter((record) => record.origin === 'import')
      .map((record) => ({ id: record.id, title: record.manifest.title })),
  ].filter(
    (translation) =>
      !installedOnly ||
      translation.id === value ||
      installed.some((record) => record.id === translation.id),
  );
  return (
    <Select
      value={value}
      onValueChange={(id) => {
        if (id) onValueChange(id);
      }}
      disabled={disabled}
    >
      <Select.Trigger
        className={cls.trigger}
        aria-label={m.translation_label()}
      >
        <span>
          {choices.find((translation) => translation.id === value)?.title ??
            value}
        </span>
        <Select.Icon />
      </Select.Trigger>
      <Select.Content>
        {choices.map((translation) => (
          <Select.Item key={translation.id} value={translation.id}>
            <span className={cls.option}>
              {translation.title}
              <small>
                {installed.some((record) => record.id === translation.id)
                  ? m.translation_downloaded()
                  : m.translation_not_downloaded()}
              </small>
            </span>
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
}
