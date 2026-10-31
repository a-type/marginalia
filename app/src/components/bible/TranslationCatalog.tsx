 
import { m } from '#/paraglide/messages';
import { Button, Icon, Input, Select } from '@a-type/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useDeferredValue, useId, useState } from 'react';
import type { FetchBibleTranslation } from '../../lib/bible/fetch-bible';
import { filterFetchBibleTranslations } from '../../lib/bible/fetch-bible';
import { downloadTranslation } from '../../lib/bible/translation-jobs';
import {
  fetchBibleCatalogQueryOptions,
  translationsQueryOptions,
} from '../../queries/translations';
import { TranslationAttribution } from './TranslationAttribution';
import cls from './TranslationCatalog.module.css';

const pageSize = 10;

export function TranslationCatalog({
  onSelect,
}: {
  onSelect?: (translation: FetchBibleTranslation) => void;
}) {
  const catalog = useQuery(fetchBibleCatalogQueryOptions);
  const searchId = useId();
  const languageId = useId();
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('');
  const [page, setPage] = useState(0);
  const deferredText = useDeferredValue(text);
  const translations = catalog.data ?? [];
  const languages = [
    ...new Map(
      translations.map((translation) => [
        translation.language,
        `${translation.languageName} · ${translation.languageLocalName}`,
      ]),
    ).entries(),
  ];
  const results = filterFetchBibleTranslations(
    translations,
    deferredText,
    language,
  );
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className={cls.root} aria-label={m.translation_catalog_title()}>
      <h3>{m.translation_catalog_title()}</h3>
      <div className={cls.filters}>
        <label className={cls.textFilter} htmlFor={searchId}>
          {m.translation_catalog_search()}
          <Input
            id={searchId}
            className={cls.searchInput}
            type="search"
            value={text}
            onValueChange={(value) => {
              setText(value);
              setPage(0);
            }}
          />
        </label>
        <label className={cls.languageFilter} htmlFor={languageId}>
          {m.language_label()}
          <Select
            value={language}
            onValueChange={(value) => {
              setLanguage(value ?? '');
              setPage(0);
            }}
            itemToStringLabel={(value) =>
              languages.find(([id]) => id === value)?.[1] ??
              m.translation_all_languages()
            }
          >
            <Select.Trigger
              id={languageId}
              aria-label={m.translation_catalog_language()}
              className={cls.languageTrigger}
            >
              <span>
                {languages.find(([id]) => id === language)?.[1] ??
                  m.translation_all_languages()}
              </span>
              <Select.Icon />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="">
                {m.translation_all_languages()}
              </Select.Item>
              {languages.map(([id, name]) => (
                <Select.Item value={id} key={id}>
                  {name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </label>
      </div>
      {catalog.isPending && catalog.fetchStatus !== 'paused' ? (
        <p role="status">{m.translation_catalog_loading()}</p>
      ) : catalog.isError ? (
        <div role="alert">
          <p>{m.translation_catalog_error()}</p>
          <Button
            size="small"
            onClick={() => {
              void catalog.refetch();
            }}
          >
            <Icon name="refresh" />
            {m.translation_retry()}
          </Button>
        </div>
      ) : (
        <>
          <p role="status">
            {results.length
              ? m.translation_catalog_count({ count: results.length })
              : m.translation_catalog_empty()}
          </p>
          <ul className={cls.list}>
            {results
              .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
              .map((translation) => (
                <li key={translation.id} className={cls.row}>
                  <div className={cls.details}>
                    <h4 dir="auto">{translation.title}</h4>
                    {translation.englishTitle !== translation.title && (
                      <p>{translation.englishTitle}</p>
                    )}
                    <small>
                      {translation.languageName} ·{' '}
                      {translation.localAbbreviation ||
                        translation.abbreviation}{' '}
                      · {translation.id}
                    </small>
                    <TranslationAttribution metadata={translation} />
                  </div>
                  {onSelect ? (
                    <Button size="small" onClick={() => onSelect(translation)}>
                      {m.translation_choose()}
                    </Button>
                  ) : (
                    <CatalogDownload translationId={translation.id} />
                  )}
                </li>
              ))}
          </ul>
          {pages > 1 && (
            <nav
              className={cls.pagination}
              aria-label={m.translation_catalog_pages()}
            >
              <Button
                size="small"
                title={m.bible_search_previous()}
                aria-label={m.bible_search_previous()}
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <Icon name="arrowLeft" />
              </Button>
              <span>
                {m.bible_search_page({ page: currentPage + 1, pages })}
              </span>
              <Button
                size="small"
                title={m.bible_search_next()}
                aria-label={m.bible_search_next()}
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                <Icon name="arrowRight" />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function CatalogDownload({ translationId }: { translationId: string }) {
  const translations = useQuery(translationsQueryOptions);
  const record = translations.data?.find(
    (translation) => translation.id === translationId,
  );
  const job = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const storage = (navigator as Partial<Navigator>).storage;
      if (storage && typeof storage.persist === 'function')
        void storage.persist().catch(() => false);
      await downloadTranslation(translationId);
    },
  });
  const busy =
    job.isPending ||
    Boolean(record?.owner && (record.leaseUntil ?? 0) > Date.now());
  return (
    <div className={cls.download}>
      {record?.sourceStatus === 'ready' ? (
        <small>{m.translation_downloaded()}</small>
      ) : (
        <Button size="small" disabled={busy} onClick={() => job.mutate()}>
          <Icon name={record ? 'refresh' : 'download'} />
          {busy
            ? m.translation_downloading()
            : record
              ? m.translation_resume()
              : m.translation_download()}
        </Button>
      )}
      {job.error && <p role="alert">{job.error.message}</p>}
    </div>
  );
}
