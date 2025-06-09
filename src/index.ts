import { Context, Schema, Session, h } from 'koishi'
import { } from "@koishijs/plugin-adapter-qq"

export const name = 'smmcat-koishimonitor'

export interface Config {
  Cookie: string,
  timer: number,
  useNode: any,
  displayUrl: boolean,
  maxHeight: number,
  maxTextLen: number,
  lastMsg: boolean,
  useGuildList: string[]
}
export const Config: Schema<Config> = Schema.object({
  useNode: Schema.union([
    Schema.const('https://forum.koishi.xyz/new.json?order=created&ascending=false').description('新'),
    Schema.const('https://forum.koishi.xyz/unread.json?order=created&ascending=false').description('未读'),
  ]).default('https://forum.koishi.xyz/new.json?order=created&ascending=false').description('节点选择'),
  Cookie: Schema.string().required().description('社区的cookie的值'),
  timer: Schema.number().default(8000).description('监听频率'),
  maxHeight: Schema.number().default(5).description('最大记录历史长度'),
  lastMsg: Schema.boolean().default(false).description('尝试获取每个内容的最后一条消息'),
  maxTextLen: Schema.number().default(100).description('最后一条消息最大长度'),
  displayUrl: Schema.boolean().default(false).description('是否显示跳转链接 [qqbot适配器不支持]'),
  useGuildList: Schema.array(String).role("table").default([]).description("推送消息到目标的群"),
})

export function apply(ctx: Context, config: Config) {

  // 消息控件
  const msg = {
    send: async (str: String) => {
      const onebotBot = ctx.bots.filter((item) => item.platform == 'onebot')
      config.useGuildList.forEach((guildId) => {
        onebotBot.forEach((bot) => {
          bot.sendMessage(guildId, h.text(str))
        })
      })
    }
  }

  let beforMsg = {}
  let discard = {}
  let lastMsg = ''

  function truncateArray(arr) {
    if (arr.length > config.maxHeight) {
      return arr.slice(0, config.maxHeight);
    } else {
      return arr;
    }
  }

  function truncateText(text) {
    if (text.length <= config.maxTextLen) {
      return text;
    } else {
      return text.slice(0, config.maxTextLen) + '...';
    }
  }

  async function getNewMsgInfo() {
    const result = await ctx.http.get(config.useNode, {
      headers: {
        'Cookie': config.Cookie
      }
    })

    if (result.topic_list?.topics) {
      if (!result.topic_list?.topics?.length) {
        return
      }
      const temp = truncateArray(result.topic_list?.topics.map(item => {
        return {
          id: item.id,
          title: item.title,
          image_url: item.image_url,
          tags: item.tags,
          lastHuman: item.last_poster_username,
          lastTime: item.last_posted_at,
          higthest: item.highest_post_number
        }
      }))

      temp.forEach(item => {
        beforMsg[item.id] = item
      })
    }

    const type = Object.keys(beforMsg).filter((item: any) => {
      if (discard[item] && discard[item] == beforMsg[item].higthest) {
        return false
      } else {
        return true
      }
    })

    if (!type.length) return

    // 获取最后发言内容
    if (config.lastMsg) {
      const eventList = type.map((pageId) => {
        return new Promise(async (resolve, reject) => {
          try {
            const result = await ctx.http.get(`https://forum.koishi.xyz/t/${pageId}/1.json?track_visit=true&forceLoad=true`)
            const regex = /<[^>]*>|&[^;]+;/g;
            const msg = truncateText(result.post_stream.posts[result.post_stream.posts.length - 1].cooked.replace(regex, ''));
            beforMsg[pageId].lastConetnt = msg
            resolve(1)
          } catch (error) {
            resolve(0)
          }
        })
      })

      await Promise.all(eventList)
    }

    let msgInfo = ''
    type.forEach(async (item: any) => {

      // 记录发过的内容
      if (msg.send) {
        discard[beforMsg[item].id] = beforMsg[item].higthest
      }

      msgInfo += `
标题：${beforMsg[item].title}
最后发言人：${beforMsg[item].lastHuman}
楼层：${beforMsg[item].higthest}
最后发言时间：${beforMsg[item].lastTime}
${beforMsg[item].lastConetnt ? `最后内容：${beforMsg[item].lastConetnt}` : ''}
${config.displayUrl ? `链接：https://forum.koishi.xyz/t/topic/${beforMsg[item].id}/${beforMsg[item].higthest}` : ''}
`
    })

    lastMsg = msgInfo
    msg.send && await msg.send('\n[ ! ] koishi社区 有新消息！\n' + msgInfo)
  }
  ctx.setInterval(() => {
    getNewMsgInfo()
  }, config.timer)

  ctx
    .command('最后消息')
    .action(async ({ session }) => {
      lastMsg ? await session.send('记录下的最后消息：\n' + lastMsg) : await session.send('当前没有最后消息')
    })
}



