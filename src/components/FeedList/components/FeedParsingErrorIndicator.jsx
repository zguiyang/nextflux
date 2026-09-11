import { TriangleAlert } from "lucide-react";
import { Button, Tooltip } from "@heroui/react";
import { toast } from "sonner";
import {
  getFeedParsingErrorMessage,
  hasFeedParsingError,
} from "@/lib/feedMetadata.js";

const stopNavigation = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

const FeedParsingErrorIndicator = ({ feed, fallbackMessage, isMobile }) => {
  if (!hasFeedParsingError(feed)) {
    return null;
  }

  const message = getFeedParsingErrorMessage(feed, fallbackMessage);

  const showDetails = (event) => {
    stopNavigation(event);
    toast.info(message);
  };

  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        className="size-4 min-w-4 p-0 text-warning bg-transparent hover:bg-transparent border-none shadow-none"
        aria-label={message}
        onPress={isMobile ? showDetails : undefined}
        onClick={stopNavigation}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            showDetails(event);
          }
        }}
      >
        <TriangleAlert className="size-4" aria-hidden="true" />
      </Button>
      <Tooltip.Content>
        <p className="max-w-xs wrap-break-word">{message}</p>
      </Tooltip.Content>
    </Tooltip>
  );
};

export default FeedParsingErrorIndicator;
