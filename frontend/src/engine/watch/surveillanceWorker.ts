import { ingestStudyFiles } from '../atlas/ingestion';
import { StudyWatch, WatchOptions } from './studyWatch';

export interface WorkerRequestMessage {
  id: string;
  rawFiles: Record<string, string>;
  studyName: string;
  options: WatchOptions;
}

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const { id, rawFiles, studyName, options } = event.data;
  try {
    const data = ingestStudyFiles(rawFiles, studyName);
    const watch = new StudyWatch(data, options);
    watch.runPeriod();

    self.postMessage({
      id,
      ok: true,
      summary: {
        studyName: data.studyName,
        domainCount: data.domains.size,
        recordCount: data.recordsByKey.size,
      },
    });
  } catch (err: any) {
    self.postMessage({
      id,
      ok: false,
      error: err?.message || 'Worker execution failed',
    });
  }
};
