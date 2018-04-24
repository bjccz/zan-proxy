import Vue from 'vue'
import Vuex from 'vuex'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-default/index.css'
import io from 'socket.io-client'

import App from './App'
import { createStore } from './store'

Vue.use(ElementUI)
Vue.use(Vuex)

const link = io()

new Vue({
  el: '#app',
  store: createStore(link),
  render: h => h(App)
})
