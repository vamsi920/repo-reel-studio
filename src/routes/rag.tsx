import { useParams } from "react-router";
import { RagHome } from "#/components/features/rag/rag-home";
import { RagCollectionPage } from "#/components/features/rag/rag-collection-page";

/**
 * Neo RAG module (specs/neo-rag.md): `/rag` lists the team's knowledge
 * collections, `/rag/:collectionId` opens one.
 */
export default function RagRoute() {
  const { collectionId } = useParams<{ collectionId?: string }>();
  return collectionId ? (
    <RagCollectionPage collectionId={collectionId} />
  ) : (
    <RagHome />
  );
}
