import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { BrandButton } from "#/components/features/settings/brand-button";
import { copyTextToClipboard } from "#/utils/copy-text-to-clipboard";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import {
  buildWebhookCurl,
  recallWebhookSecret,
  rememberWebhookSecret,
} from "#/utils/automation-webhook";
import { AUTOMATION_RUNS_QUERY_KEY } from "#/hooks/query/use-automation-detail";

export const AUTOMATION_WEBHOOKS_QUERY_KEY = ["automation-webhooks"] as const;

function CopyRow({
  label,
  value,
  testId,
  multiline = false,
}: {
  label: string;
  value: string;
  testId: string;
  multiline?: boolean;
}) {
  const { t } = useTranslation("openhands");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre
            data-testid={testId}
            className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md border border-[var(--oh-border)] bg-surface-raised px-3 py-2 font-mono text-xs text-content"
          >
            {value}
          </pre>
        ) : (
          <code
            data-testid={testId}
            className="min-w-0 flex-1 break-all rounded-md border border-[var(--oh-border)] bg-surface-raised px-3 py-2 font-mono text-xs text-content"
          >
            {value}
          </code>
        )}
        <button
          type="button"
          onClick={async () => {
            if (await copyTextToClipboard(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
          className="shrink-0 rounded-md border border-[var(--oh-border)] px-2.5 py-2 text-xs text-content hover:bg-surface-raised"
        >
          {copied ? t(I18nKey.BUTTON$COPIED) : t(I18nKey.BUTTON$COPY)}
        </button>
      </div>
    </div>
  );
}

interface WebhookTriggerPanelProps {
  automationId: string;
  source: string;
}

/**
 * Where to send events for a webhook automation, how to sign them, and a
 * button that sends a signed test event. The signing secret is only known
 * right after creation or a rotation, so it is shown then and never stored.
 */
export function WebhookTriggerPanel({
  automationId,
  source,
}: WebhookTriggerPanelProps) {
  const { t } = useTranslation("openhands");
  const active = useActiveBackend();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState(() => recallWebhookSecret(source));
  const [isRotating, setIsRotating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { data: webhook } = useQuery({
    queryKey: [
      ...AUTOMATION_WEBHOOKS_QUERY_KEY,
      active.backend.id,
      active.backend.connectionRevision ?? 0,
    ],
    queryFn: () => AutomationService.listCustomWebhooks(),
    select: (hooks) => hooks.find((hook) => hook.source === source) ?? null,
    staleTime: 60_000,
  });

  if (!webhook) return null;

  const handleRotate = async () => {
    setIsRotating(true);
    try {
      const next = await AutomationService.rotateWebhookSecret(webhook.id);
      rememberWebhookSecret(source, next);
      setSecret(next);
    } catch (error) {
      displayErrorToast(getApiErrorMessage(error, t(I18nKey.ERROR$GENERIC)));
    } finally {
      setIsRotating(false);
    }
  };

  const handleSendTest = async () => {
    if (!secret) return;
    setIsSending(true);
    try {
      const started = await AutomationService.sendWebhookTestEvent({
        webhook_url: webhook.webhook_url,
        signature_header: webhook.signature_header,
        secret,
      });
      displaySuccessToast(
        t(I18nKey.AUTOMATIONS$WEBHOOK$TEST_SENT, { count: started }),
      );
      await queryClient.invalidateQueries({
        queryKey: [...AUTOMATION_RUNS_QUERY_KEY, automationId],
      });
    } catch (error) {
      displayErrorToast(getApiErrorMessage(error, t(I18nKey.ERROR$GENERIC)));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      data-testid="webhook-trigger-panel"
      className="mt-5 flex flex-col gap-4 border-t border-[var(--oh-border)] pt-5"
    >
      <CopyRow
        label={t(I18nKey.AUTOMATIONS$WEBHOOK$URL)}
        value={webhook.webhook_url}
        testId="webhook-url"
      />
      <p className="text-xs text-muted">
        {t(I18nKey.AUTOMATIONS$WEBHOOK$SIGNING, {
          header: webhook.signature_header,
        })}
      </p>
      {secret ? (
        <>
          <CopyRow
            label={t(I18nKey.AUTOMATIONS$WEBHOOK$SECRET)}
            value={secret}
            testId="webhook-secret"
          />
          <p className="text-xs text-[var(--oh-warning)]">
            {t(I18nKey.AUTOMATIONS$WEBHOOK$SECRET_ONCE)}
          </p>
          <CopyRow
            label={t(I18nKey.AUTOMATIONS$WEBHOOK$TEST_COMMAND)}
            value={buildWebhookCurl({
              url: webhook.webhook_url,
              header: webhook.signature_header,
              secret,
            })}
            testId="webhook-curl"
            multiline
          />
        </>
      ) : (
        <p className="text-xs text-muted">
          {t(I18nKey.AUTOMATIONS$WEBHOOK$SECRET_HIDDEN)}
        </p>
      )}
      <p className="text-xs text-muted">
        {t(I18nKey.AUTOMATIONS$WEBHOOK$REACHABILITY)}
      </p>
      <div className="flex flex-wrap gap-2">
        {secret && (
          <BrandButton
            testId="webhook-send-test"
            type="button"
            variant="primary"
            onClick={handleSendTest}
            isDisabled={isSending}
          >
            {t(I18nKey.AUTOMATIONS$WEBHOOK$SEND_TEST)}
          </BrandButton>
        )}
        <BrandButton
          testId="webhook-rotate-secret"
          type="button"
          variant="secondary"
          onClick={handleRotate}
          isDisabled={isRotating}
        >
          {t(I18nKey.AUTOMATIONS$WEBHOOK$ROTATE)}
        </BrandButton>
      </div>
    </div>
  );
}
