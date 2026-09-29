import React from "react";
import {
  UseComboboxGetMenuPropsOptions,
  UseComboboxGetItemPropsOptions,
} from "downshift";
import { useTranslation } from "react-i18next";
import { Branch } from "#/types/git";
import { I18nKey } from "#/i18n/declaration";
import { DropdownItem } from "../shared/dropdown-item";
import { GenericDropdownMenu, EmptyState } from "../shared";

export interface BranchDropdownMenuProps {
  isOpen: boolean;
  filteredBranches: Branch[];
  inputValue: string;
  highlightedIndex: number;
  selectedItem: Branch | null;
  getMenuProps: <Options>(
    options?: UseComboboxGetMenuPropsOptions & Options,
  ) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  getItemProps: <Options>(
    options: UseComboboxGetItemPropsOptions<Branch> & Options,
  ) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onScroll: (event: React.UIEvent<HTMLUListElement>) => void;
  menuRef: React.RefObject<HTMLUListElement | null>;
  /**
   * True once we've conclusively determined the GitHub connection this
   * branch lookup depends on is dead (see useBranchData/isProviderDisconnected).
   * Renders the same actionable "GitHub isn't connected" message the sibling
   * repository dropdown already shows for this failure, instead of a bare
   * empty state indistinguishable from "this repository really has no
   * branches".
   */
  isProviderDisconnected?: boolean;
}

export function BranchDropdownMenu({
  isOpen,
  filteredBranches,
  inputValue,
  highlightedIndex,
  selectedItem,
  getMenuProps,
  getItemProps,
  onScroll,
  menuRef,
  isProviderDisconnected = false,
}: BranchDropdownMenuProps) {
  const { t } = useTranslation("openhands");
  const renderItem = (
    branch: Branch,
    index: number,
    currentHighlightedIndex: number,
    currentSelectedItem: Branch | null,
    currentGetItemProps: <Options>(
      options: UseComboboxGetItemPropsOptions<Branch> & Options,
    ) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ) => (
    <DropdownItem
      key={branch.name}
      item={branch}
      index={index}
      isSelected={currentSelectedItem?.name === branch.name}
      getItemProps={currentGetItemProps}
      getDisplayText={(branchItem) => branchItem.name}
      getItemKey={(branchItem) => branchItem.name}
    />
  );

  const renderEmptyState = (currentInputValue: string) => (
    <li className="px-3 py-2">
      <EmptyState
        inputValue={currentInputValue}
        searchMessage={
          isProviderDisconnected
            ? t(I18nKey.HOME$GITHUB_NOT_CONNECTED)
            : t(I18nKey.HOME$NO_BRANCH_FOUND)
        }
        emptyMessage={
          isProviderDisconnected
            ? t(I18nKey.HOME$GITHUB_NOT_CONNECTED)
            : t(I18nKey.HOME$NO_BRANCH_AVAILABLE)
        }
        testId={
          isProviderDisconnected
            ? "git-branch-dropdown-disconnected"
            : "git-branch-dropdown-empty"
        }
      />
    </li>
  );

  return (
    <div data-testid="git-branch-dropdown-menu">
      <GenericDropdownMenu
        isOpen={isOpen}
        filteredItems={filteredBranches}
        inputValue={inputValue}
        highlightedIndex={highlightedIndex}
        selectedItem={selectedItem}
        getMenuProps={getMenuProps}
        getItemProps={getItemProps}
        onScroll={onScroll}
        menuRef={menuRef}
        renderItem={renderItem}
        renderEmptyState={renderEmptyState}
        itemKey={(branch) => branch.name}
      />
    </div>
  );
}
