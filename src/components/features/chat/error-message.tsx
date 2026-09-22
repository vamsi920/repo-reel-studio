import React from "react";
import { useTranslation } from "react-i18next";
import type { ErrorClassification } from "@openhands/typescript-client";
import ArrowDown from "#/icons/angle-down-solid.svg?react";
import ArrowUp from "#/icons/angle-up-solid.svg?react";
import { getAgentErrorHeaderKey } from "#/utils/agent-error-classification";
import { MarkdownRenderer } from "../markdown/markdown-renderer";

interface ErrorMessageProps {
  classification?: ErrorClassification | null;
  defaultMessage: string;
}

export function ErrorMessage({
  classification,
  defaultMessage,
}: ErrorMessageProps) {
  const { t } = useTranslation("openhands");
  const [showDetails, setShowDetails] = React.useState(false);

  const errorKey = getAgentErrorHeaderKey(classification);

  return (
    <div className="flex flex-col gap-2 my-2 py-2 text-sm w-full">
      <div className="font-bold text-danger">
        {t(errorKey)}
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="cursor-pointer text-left"
        >
          {showDetails ? (
            <ArrowUp className="h-4 w-4 ml-2 inline fill-danger" />
          ) : (
            <ArrowDown className="h-4 w-4 ml-2 inline fill-danger" />
          )}
        </button>
      </div>

      {showDetails && <MarkdownRenderer>{defaultMessage}</MarkdownRenderer>}
    </div>
  );
}
