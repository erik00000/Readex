import { Check, FileWarning, LoaderCircle, SkipForward } from 'lucide-react'
import type { ImportJob } from '@shared/types'

interface ImportOverlayProps {
  jobs: ImportJob[]
  completed: number
  total: number
}

export function ImportOverlay({ jobs, completed, total }: ImportOverlayProps): React.JSX.Element {
  const current = jobs.find((job) => job.status === 'checking' || job.status === 'importing')
  const visibleJobs = jobs.slice(-4)

  return (
    <div className="modal-backdrop import-backdrop">
      <section className="import-panel">
        <div className="import-panel-heading">
          <LoaderCircle className="spin" size={22} />
          <div>
            <h2>正在导入图书</h2>
            <p>
              {current?.fileName ?? '正在更新资料库'} · {completed}/{total}
            </p>
          </div>
        </div>
        <div className="import-progress">
          <span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
        <div className="import-job-list">
          {visibleJobs.map((job) => (
            <div className="import-job" key={job.id}>
              <span className={`import-job-icon ${job.status}`}>
                {job.status === 'success' ? (
                  <Check size={15} />
                ) : job.status === 'skipped' ? (
                  <SkipForward size={15} />
                ) : job.status === 'failed' ? (
                  <FileWarning size={15} />
                ) : (
                  <LoaderCircle className="spin" size={14} />
                )}
              </span>
              <span className="import-job-name">{job.fileName}</span>
              <span className="import-job-message">{job.message ?? '等待处理'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
