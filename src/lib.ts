import { SphinxProvider, EnableRes, KeysendRes, KeysendArgs } from './provider'
import {postMessage, addEventer, removeEventer} from './postMessage'

export enum MSG_TYPE {
  AUTHORIZE = 'AUTHORIZE',
  INFO = 'INFO',
  KEYSEND = 'KEYSEND',
  UPDATED = 'UPDATED',
  PAYMENT = 'PAYMENT',
  INVOICE = 'INVOICE',
  SIGN = 'SIGN',
  VERIFY = 'VERIFY',
}

const APP_NAME='Sphinx'

export default class Sphinx implements SphinxProvider {
  private isEnabled: boolean = false;
  private active: MSG_TYPE | null = null;
  private budget: number = 0;
  private pubkey: string = '';
  private logging: boolean = false;

  async enable(logging?:boolean) {
    if(logging) this.logging=true
    if(this.logging) console.log('=> ENABLE!')
    if (this.isEnabled) {
      return {
        budget:this.budget, 
        pubkey:this.pubkey, 
        application:APP_NAME
      }
    }
    try {
      const r = await this.postMsg<EnableRes>(MSG_TYPE.AUTHORIZE)
      if(r.budget && r.pubkey) {
        this.isEnabled = true
        this.budget = r.budget
        this.pubkey = r.pubkey
        return r
      }
    } catch(e) {
      if(this.logging) console.log(e)
    }
    return null
  }

  async keysend(dest: string, amt: number) {
    if(this.logging) console.log('=> KEYSEND')
    if (!this.isEnabled) return null
    if (!dest || !amt) return null
    if (dest.length!==66) return null
    if (amt<1) return null
    if (amt>this.budget) return null
    try {
      const args:KeysendArgs = {dest,amt}
      const r = await this.postMsg<KeysendRes, KeysendArgs>(MSG_TYPE.KEYSEND, args)
      if(r && r.success) {
        this.budget = this.budget-amt
        r.budget = this.budget
      }
      return r
    } catch(e) {
      if(this.logging) console.log(e)
      return null
    }
  }

  async updated() {
    if(this.logging) console.log('=> UDPATED')
    if (!this.isEnabled) return null
    try {
      const r = await this.postMsg(MSG_TYPE.UPDATED)
      return r
    } catch(e) {
      if(this.logging) console.log(e)
      return null
    }
  }

  // Internal prompt handler
  private postMsg<R = undefined, T = undefined>(
    type: MSG_TYPE,
    args?: T,
  ): Promise<R> {
    var self = this
    if (self.active) {
      Promise.reject(new Error('User is busy'))
    }
    self.active = type
    return new Promise((resolve, reject) => {
      postMessage({
        application: APP_NAME,
        type,
        ...(args||{}),
      })
      function handleWindowMessage(ev: MessageEvent) {
        if (!ev.data || ev.data.application !== APP_NAME) {
          return
        }
        if (ev.data.error) {
          self.active = null
          reject(ev.data.error);
        } else {
          self.active = null
          resolve(ev.data);
        }
        removeEventer(handleWindowMessage)
      }

      addEventer(handleWindowMessage)
    })
  }

}