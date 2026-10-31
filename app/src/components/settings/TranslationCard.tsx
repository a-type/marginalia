import { m } from '#/paraglide/messages';
import { Button, Card, Chip, Icon, Progress } from '@a-type/ui';
import { useMutation } from '@tanstack/react-query';
import type { FetchBibleTranslation } from '../../lib/bible/fetch-bible';
import {
  downloadTranslation,
  stopTranslation,
} from '../../lib/bible/translation-jobs';
import type { StoredTranslation } from '../../lib/bible/translations';
import { TranslationAttribution } from '../bible/TranslationAttribution';
import cls from './TranslationCard.module.css';
import {
  requestPersistence,
  translationStatus,
} from './translationManagerUtils';

export function TranslationCard({
  translation,
  record,
  active,
  onSelect,
  onDelete,
}: {
  translation: FetchBibleTranslation;
  record?: StoredTranslation;
  active: boolean;
  onSelect?: (translation: FetchBibleTranslation) => void;
  onDelete: () => void;
}) {
  const job = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      requestPersistence();
      await downloadTranslation(translation.id);
    },
  });
  const cancel = useMutation({
    networkMode: 'always',
    mutationFn: () => stopTranslation(translation.id),
  });
  const busy = Boolean(record?.owner && (record.leaseUntil ?? 0) > Date.now());
  const readingReady = record?.sourceStatus === 'ready';
  const preparing = readingReady && record.searchStatus !== 'ready';
  return (
    <Card render={<li />} size="sm">
      <Card.Main>
        <Card.Title dir="auto">{translation.title}</Card.Title>
        <Card.Content className="@mode-denser">
          <TranslationAttribution metadata={translation} />
        </Card.Content>
        <Card.Content>
          <Chip>
            {translation.languageName || translation.language || '-'}
            {translation.languageLocalName &&
              translation.languageLocalName !== translation.languageName && (
                <span>{translation.languageLocalName}</span>
              )}
          </Chip>
          <Chip role="status">{translationStatus(record)}</Chip>
          {readingReady && (
            <Chip>
              {record.searchStatus === 'ready'
                ? m.translation_search_ready()
                : record.searchStatus === 'error'
                  ? m.translation_search_error()
                  : m.translation_preparing()}
            </Chip>
          )}
          {record && (
            <Chip>
              {m.translation_books({ count: record.manifest.books.length })}
            </Chip>
          )}
          {(record?.error || job.error || cancel.error) && (
            <Chip role="alert" className="@mode-attention" emphasis="primary">
              {record?.error || job.error?.message || cancel.error?.message}
            </Chip>
          )}
        </Card.Content>
        {record && (!readingReady || preparing) && (
          <Progress
            aria-label={
              preparing
                ? m.translation_preparing()
                : m.translation_downloading()
            }
            value={preparing ? record.prepared : record.downloaded}
            max={record.manifest.books.length}
            className={cls.downloadProgress}
          />
        )}
      </Card.Main>
      <Card.Footer>
        <Card.Actions>
          {onSelect && (
            <Button
              size="small"
              toggled={active}
              onClick={() => onSelect(translation)}
            >
              {m.translation_choose()}
            </Button>
          )}
          {busy ? (
            <Button
              emphasis="ghost"
              size="small"
              title={m.annotation_cancel()}
              aria-label={m.annotation_cancel()}
              onClick={() => cancel.mutate()}
            >
              <Icon name="x" />
            </Button>
          ) : (
            (!readingReady || preparing) && (
              <Button
                size="small"
                disabled={job.isPending}
                onClick={() => job.mutate()}
              >
                <Icon name={record ? 'refresh' : 'download'} />
                {preparing
                  ? m.translation_retry_search()
                  : record
                    ? m.translation_resume()
                    : m.translation_download()}
              </Button>
            )
          )}
          {record && (
            <Button
              emphasis="ghost"
              size="small"
              title={m.translation_delete()}
              aria-label={m.translation_delete()}
              onClick={onDelete}
            >
              <Icon name="trash" />
            </Button>
          )}
        </Card.Actions>
      </Card.Footer>
    </Card>
  );
}
