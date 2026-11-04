// FORK: custom code, not part of the upstream s3-browser repo.
import React, { useState } from "react";
import PropTypes from "prop-types";
import { Button, Text } from "@chakra-ui/react";
import { GrDownload } from "react-icons/gr";
import { downloadZip } from "./zipDownload";

export default function DownloadZipButton({ prefix }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const busy = progress !== null;

  const handleClick = async () => {
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      await downloadZip(prefix, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
    } catch (e) {
      setError(e.message || "Download failed.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        alignSelf="flex-start"
        onClick={handleClick}
        disabled={busy}
      >
        <GrDownload />
        {busy
          ? progress.total
            ? `Zipping ${progress.done}/${progress.total}…`
            : "Preparing…"
          : "Download folder as ZIP"}
      </Button>
      {error && (
        <Text role="alert" color="red.600" fontSize="sm">
          {error}
        </Text>
      )}
    </>
  );
}

DownloadZipButton.propTypes = {
  prefix: PropTypes.string,
};
