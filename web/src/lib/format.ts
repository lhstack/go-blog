import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

/** formatDate 把 ISO 时间格式化为 YYYY-MM-DD。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '未发布'
  }
  return dayjs(value).format('YYYY-MM-DD')
}

/** formatDateTime 输出到分钟，用于评论与管理列表。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

