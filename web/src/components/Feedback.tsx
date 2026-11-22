import { Button, Result, Spin } from 'antd'
import { Link } from 'react-router-dom'

/** Loading 是页面级加载态。 */
export function Loading({ tip = '加载中' }: { tip?: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '72px 0' }}>
      <Spin tip={tip} size="large">
        <div style={{ width: 120, height: 40 }} />
      </Spin>
    </div>
  )
}

/** ErrorResult 用于请求失败或资源不存在。 */
export function ErrorResult({
  status = 'error',
  title,
  description,
  action,
}: {
  status?: 'error' | '404' | '403'
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Result
      status={status}
      title={title}
      subTitle={description}
      extra={
        action ?? (
          <Link to="/">
            <Button type="primary">回到首页</Button>
          </Link>
        )
      }
    />
  )
}
