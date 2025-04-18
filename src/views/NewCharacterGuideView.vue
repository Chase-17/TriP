<script setup>
import NameGen from '../assets/namegen.js'
import $RACES from '../data/races.js'
import $AGES from '../data/ages.js'
import $ASPECTS from '../data/aspects.js'
import $CLASSES from '../data/classes.js'
import $ORIGINS from '../data/origins.js'
import $WEALTHS from '../data/wealths.js'
import $EPOCHS from '../data/epochs.js'
import $ITEMS from '../data/items.js'
import $ITEM_TYPES from '../data/item_types.js'
import $LANG from '../data/ru.js'

import { ref, watch, reactive } from 'vue'
</script>

<script>
export default {
  data: () => ({
    char_data: {},
    gen_options: {
      syl_mod: {
        cvc: 1,
        cv: 1,
        vc: 1,
        v: 1
      },
      group_mod: {
        hard: 1,
        soft: 1,
        voiced: 1,
        voiceless: 1,
        sonorant: 1
      },
      syl_number: 1
    },
    tabs: {
      race: {
        icon: 'mdi:dna',
        tip: 'Вид',
        show: true,
        done: false
      },
      class: {
        icon: 'game-icons:burning-passion',
        tip: 'Класс',
        show: true,
        done: false
      },
      profile: {
        icon: 'hugeicons:passport',
        tip: 'Профиль',
        show: true,
        done: false
      },
      stats: {
        icon: 'game-icons:stars-stack',
        tip: 'Умения',
        show: true,
        done: false
      },
      equip: {
        icon: 'game-icons:battle-gear',
        tip: 'Предметы',
        show: true,
        done: false
      }
    },
    type_filter: [],
    active_tab: 'race',
    modal_shown: false,
    weapon_modal_shown: false,
    modal_weapon: {},
    tip_text: '',
    male: true,
    origin: 0,
    price_filter: 6,
    epoch_filter: 5,
    trait_scroller: [0, 0, 0],
    armor_chosen: 0,
    filter_and: false,
    class_filter: ['war', 'knowledge', 'society', 'shadow', 'mystics', 'nature']
  }),
  computed: {
    money_estimation() {
      let res = {}
      if (this.char_data.wealth < 10)
        return {
          correct: false,
          tip: 'Не определён Ваш уровень благополучия. Пожалуйста, вернитесь и переопределите его.',
          link: '#wealth'
        }
      if (this.current_armor.key == 'none')
        return {
          correct: false,
          tip: 'Не выбран никакой тип брони. Пожалуйста, выберите хотя бы простую одежду.',
          link: '#armor'
        }
      let prices = { small_price: 0, ok_price: 0, big_price: 0, huge_price: 0 }
      prices[this.countPrice(this.current_armor.price).type] += 1
      this.char_data.items_taken.forEach((value) => {
        let type = this.countPrice($ITEMS[value].price).type
        prices[type] += 1
      })

      if (prices.huge_price > 0)
        return {
          correct: false,
          tip: 'Вы выбрали вещь, которая Вам не по карману. Пожалуйста, обратите внимание на предмет, отмеченный красным'
        }
      if (prices.big_price > 1)
        return {
          correct: false,
          tip: 'Вы можете позволить себе только один предмет уровнем выше Вашего, и даже притом уровень Вашего благополучия упадёт на единицу из-за такой крупной покупки. Обратите, пожалуйста, внимание на предметы помеченные оранжевым цветом.'
        }
      if (prices.big_price == 1 && prices.ok_price > 0)
        return {
          correct: false,
          tip: 'Вы покупаете крайне дорогой для Вас предмет (помечен оранжевым), Ваш уровень благосостояния падает на единицу. Из-за этого Вы не можете покупать предметы по значительной цене (жёлтые), только по совсем небольшой (зелёные).'
        }
      if (prices.ok_price > 2)
        return {
          correct: false,
          tip: 'Вы не можете одновременно купить более двух предметов по значительной (подсвечены жёлтым) цене.'
        }
      if (prices.ok_price + prices.huge_price + prices.small_price + prices.big_price > 6)
        return {
          correct: true,
          tip: 'Вы можете продолжить, но вряд ли Вам понадобится так много предметов!'
        }
      else
        return {
          correct: true,
          tip: 'Всё подобрано отлично!'
        }
      return prices
    },
    current_race() {
      return $RACES[this.char_data.race]
    },
    current_class() {
      return $CLASSES[this.char_data.class]
    },
    current_origin() {
      let key = Object.keys($ORIGINS)[this.origin]
      return $ORIGINS[key]
    },
    current_wealth() {
      if (this.char_data.wealth < 10) return 'Не определено'
      let short_w = Math.floor(this.char_data.wealth / 10)
      return short_w + ' - ' + $WEALTHS[short_w].name
    },
    trait_list() {
      let list = []
      list.push({
        tip: 'От класса ' + this.current_class.name[this.gender] + ':',
        traits: this.current_class.traits
      })
      list.push({
        tip: 'От Аспекта ' + $ASPECTS[this.char_data.aspects[0]].name + ':',
        traits: $ASPECTS[this.char_data.aspects[0]].traits
      })
      list.push({
        tip: 'От Аспекта ' + $ASPECTS[this.char_data.aspects[1]].name + ':',
        traits: $ASPECTS[this.char_data.aspects[1]].traits
      })
      return list
    },
    age_name() {
      if (this.char_data.age == null) return '---'
      else return $AGES[this.char_data.age].name[this.gender]
    },
    gender() {
      if (this.male) return 'm'
      else return 'f'
    },
    current_armor() {
      if (this.armor_chosen == null)
        return {
          key: 'none',
          name: 'Не выбрано'
        }
      let result = this.armor_variants[this.armor_chosen]
      result.price_type = this.countPrice(result.price)
      return result
    },
    classes_filtered() {
      let filtered = {}
      if (this.filter_and)
        Object.entries($CLASSES).forEach(([key, value]) => {
          if (
            this.class_filter.includes(value.aspects[0]) &&
            this.class_filter.includes(value.aspects[1])
          )
            filtered[key] = value
        })
      else
        Object.entries($CLASSES).forEach(([key, value]) => {
          if (
            this.class_filter.includes(value.aspects[0]) ||
            this.class_filter.includes(value.aspects[1])
          )
            filtered[key] = value
        })
      return filtered
    },
    armor_variants() {
      let result = []
      Object.entries($ITEMS).forEach(([key, value]) => {
        if (value.category == 'armor') {
          let obj = value
          obj.key = key
          result.push(obj)
        }
      })
      return result
    },
    hand_items() {
      let result = []
      Object.entries($ITEMS).forEach(([key, value]) => {
        if (value.category == 'weapon' || value.category == 'shield') {
          if (value.price <= this.price_filter && value.epoch <= this.epoch_filter)
            if (this.type_filter.includes(value.subcat)) {
              let obj = value
              obj.key = key
              result.push(obj)
            }
        }
      })
      return result
    }
  },
  methods: {
    init() {
      this.resetChar()
      this.active_tab = 'race'
      this.type_filter = []
      Object.entries($ITEM_TYPES).forEach(([key, value]) => {
        this.type_filter.push(key)
      })
    },
    resetChar() {
      this.char_data = {
        race: null,
        name: '',
        picture: null,
        gender: 'male',
        age: 'young',
        class: null,
        attrs: {
          might: 0,
          reason: 0,
          charisma: 0,
          trickery: 0,
          intuition: 0,
          perception: 0
        },
        aspects: [],
        wealth: 32,
        armor: {},
        items_taken: []
      }
    },
    takeItem(key) {
      this.char_data.items_taken.push(key)
      this.closeWeaponModal()
    },
    dropItem(key) {
      this.char_data.items_taken = this.char_data.items_taken.filter((value, index, arr) => {
        return value != key
      })
      this.closeWeaponModal()
    },
    openTab(tab) {
      this.active_tab = tab
      window.scrollTo(0, 0)
    },
    tabBack() {
      let keys = Object.keys(this.tabs);
      let index = keys.indexOf(this.active_tab);
      this.tabs[keys[index]].done = false;
      index--;
      if (index < 0) index = 0;
      this.openTab(keys[index]);
    },
    tabForward() {
      let keys = Object.keys(this.tabs);
      let index = keys.indexOf(this.active_tab);
      this.tabs[keys[index]].done = true;
      index++;
      if (index > keys.length - 1) index = keys.length - 1;
      this.openTab(keys[index]);
    },
    showModal(id) {
      this.modal_shown = true
    },
    closeModal(ans) {
      this.modal_shown = false
    },
    showWeaponModal(weapon) {
      this.modal_weapon = weapon
      this.weapon_modal_shown = true
    },
    closeWeaponModal() {
      this.weapon_modal_shown = false
    },
    toggleAspectFilter(asp) {
      if (this.class_filter.includes(asp))
        this.class_filter = this.class_filter.filter((value, index, arr) => {
          return value != asp
        })
      else this.class_filter.push(asp)
    },
    toggleWeaponTypeFilter(key) {
      if (this.type_filter.includes(key))
        this.type_filter = this.type_filter.filter((value, index, arr) => {
          return value != key
        })
      else this.type_filter.push(key)
    },
    resetRace() {
      this.char_data.race = null
      window.scrollTo(0, 0)
    },

    resetClass() {
      this.char_data.class = null
      window.scrollTo(0, 0)
    },
    setClass(key) {
      this.char_data.class = key;
      this.char_data.aspects = this.current_class.aspects
      this.char_data.attrs[$ASPECTS[this.char_data.aspects[0]].attr] = 6
      this.char_data.attrs[$ASPECTS[this.char_data.aspects[1]].attr] = 4
      let attrs = []
      Object.entries($ASPECTS).forEach(([key, value]) => {
        if (
          key != $ASPECTS[this.char_data.aspects[0]].opposite &&
          key != $ASPECTS[this.char_data.aspects[1]].opposite &&
          key != $ASPECTS[this.char_data.aspects[0]].id &&
          key != $ASPECTS[this.char_data.aspects[1]].id
        ) {
          attrs.push(value.attr)
        }
      })
      let value = 4 / attrs.length
      attrs.forEach((attr) => {
        this.char_data.attrs[attr] = value
      })
    },
    swapStrongestAttributes() {
      let replace = this.char_data.attrs[$ASPECTS[this.current_class.aspects[0]].attr]
      this.char_data.attrs[$ASPECTS[this.current_class.aspects[0]].attr] =
        this.char_data.attrs[$ASPECTS[this.current_class.aspects[1]].attr]
      this.char_data.attrs[$ASPECTS[this.current_class.aspects[1]].attr] = replace
    },
    originModify(mod) {
      mod = Math.floor(Object.keys($ORIGINS).length + mod)
      this.origin = (this.origin + mod) % Object.keys($ORIGINS).length
    },
    originRand() {
      this.originModify(this.$randomInt(1, Object.keys($ORIGINS).length))
    },
    traitModify(index, mod) {
      mod = Math.floor(3 + mod)
      this.trait_scroller[index] = (this.trait_scroller[index] + mod) % 3
    },
    traitModifyRand(index) {
      let rnd = this.$randomInt(1, 2)
      this.traitModify(index, rnd)
    },
    wealthModify(mod) {
      let w = this.char_data.wealth
      let len = Object.keys($WEALTHS).length
      w += mod - 10
      w = (w + 10 * len) % (len * 10)
      w += 10
      this.char_data.wealth = w
    },
    priceFilterModify(mod) {
      let res = this.price_filter
      let len = Object.keys($WEALTHS).length
      res += mod - 1
      res = (res + len) % len
      res += 1
      this.price_filter = res
    },
    epochFilterModify(mod) {
      let res = this.epoch_filter
      let len = Object.keys($EPOCHS).length
      res += mod - 1
      res = (res + len) % len
      res += 1
      this.epoch_filter = res
    },
    wealthRand() {
      let mod = Math.floor(this.$randomInt(1, 6) / 2)
      this.char_data.wealth = 32 + mod * 10
    },
    armorModify(mod) {
      if (this.armor_chosen == null) this.armor_chosen = 0
      else {
        mod = Math.floor(this.armor_variants.length + mod)
        this.armor_chosen = (this.armor_chosen + mod) % this.armor_variants.length
      }
    },
    countPrice(item_price) {
      let wealth_level = Math.floor(this.char_data.wealth / 10)
      if (wealth_level > item_price)
        return {
          name: 'Незначительная',
          value: 0,
          type: 'small_price',
          tip: 'Покупка никак не ударит по Вашему кошельку'
        }
      if (wealth_level == item_price)
        return {
          name: 'Ощутимая',
          value: 1,
          type: 'ok_price',
          tip: 'Вы сможете купить только два таких предмета, не теряя уровня благосостояния'
        }
      if (wealth_level + 1 == item_price)
        return {
          name: 'Огромная',
          value: 10,
          type: 'big_price',
          tip: 'Покупка этого предмета опустит Ваш уровень благосостояния на 1, Вы не сможете покупать другие вещи своего прежнего уровня благосостояния'
        }
      return {
        name: 'Не по карману',
        value: 100,
        type: 'huge_price',
        tip: 'Вы никак не можете себе этого позволить.'
      }
    },
    helpModal(text) { },
    finishCharCreation() {
      // let my_characters = JSON.parse(localStorage.getItem('my_characters'))
      // if (my_characters == null) my_characters = []
      // this.armor_chosen = this.current_armor.key
      this.char_data.armor = this.armor_variants[this.armor_chosen];
      this.$CHARS.value[this.char_data.name] = this.compileChar();
      this.$updateChars(this.$CHARS.value);
      // let my_chars = this.$CHARS._value;
      // my_chars[this.char_data.name] = this.char_data;

      // localStorage.setItem("CHARS", JSON.stringify(my_chars));
      // my_characters.push(this.char_data)
      // localStorage.setItem('my_characters', JSON.stringify(my_characters))
      this.resetChar()
      this.$router.push('/')
    },
    compileChar() {
      let hp = $RACES[this.char_data.race].max_hp
        + $AGES[this.char_data.age].max_hp;
      let bursts = $RACES[this.char_data.race].bursts
        + $AGES[this.char_data.age].bursts;
      let movement = $RACES[this.char_data.race].movement
        + $AGES[this.char_data.age].movement;
      let age_name = $AGES[this.char_data.age].name[this.char_data.gender[0]];

      let res_char = {
        max_hp: hp,
        current_hp: hp,
        max_moves: movement,
        cur_moves: movement,
        max_bursts: bursts,
        cur_bursts: bursts,
        base_armor: $RACES[this.char_data.race].armor,
        race_aspects: $RACES[this.char_data.race].aspects,
        race_name: $RACES[this.char_data.race].name,
        classes: [this.char_data.class],
        aspects: $CLASSES[this.char_data.class].aspects,
        picture: this.char_data.picture,
        name: this.char_data.name,
        gender: this.char_data.gender,
        age_steps: $AGES[this.char_data.age].steps,
        age_name: age_name,
        bonus_xp: $AGES[this.char_data.age].bonus_xp,
        levelup_xp: $AGES[this.char_data.age].xp,
        attrs: this.char_data.attrs,
        checks: this.$attrToChecks(this.char_data.attrs),
        equips: { current: [], secondary: [] },
      }
      let traits = {};
      traits[`class_${this.char_data.class}_${this.trait_scroller[0]}`] = 1;
      traits[`aspect_${this.char_data.aspects[0]}_${this.trait_scroller[1]}`] = 1;
      traits[`aspect_${this.char_data.aspects[1]}_${this.trait_scroller[2]}`] = 1;
      res_char.traits = traits;
      let items = [];
      this.char_data.items_taken.forEach(k => {
        let obj = JSON.parse(JSON.stringify($ITEMS[k]));
        obj['picture'] = `img/items/${k}.png`;
        items.push(obj);
      });
      res_char.items = items;
      let armor_key = this.armor_variants[this.armor_chosen].key;
      res_char.armor_equipped = JSON.parse(JSON.stringify($ITEMS[armor_key]));
      res_char.armor_equipped.picture = `img/items/${armor_key}.png`;
      return res_char;
    },
  },
  mounted() {
    let char_data = JSON.parse(localStorage.getItem('new_char'))
    if (char_data !== null) this.char_data = char_data
    this.init();
  },
  watch: {
    $CHARS: {
      handler: (newValue, oldValue) => {

      },
      deep: true,
    },
    char_data: {
      handler: (newValue, oldValue) => {
        localStorage.setItem('new_char', JSON.stringify(newValue))
      },
      deep: true
    }
  }
}
</script>

<template>
  <new-char-guide flex flex-col>
    <new-char-tabs flex justify-between bg-zinc-700 p-2 pb-1 border-t-2 border-zinc-500 fixed bottom-0 right-0 left-0
      h-16 z-20>
      <template v-for="(tab, key) in tabs">
        <tab-control v-if="tab.show" :class="{ done: tab.done, active: active_tab == key }">
          <Icon :icon="tab.icon" />
          <tip>{{ tab.tip }}</tip>
        </tab-control>
      </template>
    </new-char-tabs>
    <guide-tab v-if="active_tab == 'overview'">

    </guide-tab>
    <guide-tab v-else-if="active_tab == 'race'">
      <div>
        <template v-if="char_data.race == null">
          <h1>Вид</h1>
          <p med>
            Биологический вид Вашего персонажа, также известный как "раса", влияет на некоторые
            стартовые характеристики и склонность к тому или иному Аспекту.
          </p>
          <p det>
            На первом уровне представители разных рас мало чем отличаются, иначе мир бы уже давно
            завоевала какая-то одна. Но по мере развития (на 3, 6, 9 и далее каждом третьем уровне)
            они получают бонусы к связанному Аспекту.
          </p>
          <p det>
            Например, для эльфов это <span nature>Природа</span> и <span knowledge>Знание</span>, а
            для людей - <span knowledge>Знание</span> и <span war>Война</span>. Значит, что на
            каждом третьем уровне персонажи этих видов будут получать бонусы к Аспекту, даже если их
            класс этого не позволяет.
          </p>
          <races-list>
            <race-block v-for="(item, key) in $RACES" @click="char_data.race = key">
              <img :src="'img/races/' + key + '.webp'" class="w-full inline-block" />
              <race-short-desc flex justify-center class="bg-subtle-gradient from-10% to-90%"
                :class="['from-' + item.aspects[0] + '-dark', 'to-' + item.aspects[1] + '-dark']">
                <race-name>{{ item.name }}</race-name>
              </race-short-desc>
            </race-block>
          </races-list>
        </template>
        <race-info-block v-if="char_data.race != null" flex flex-col>
          <h1>{{ current_race.name }}</h1>

          <race-info-block class="grid grid-cols-1 md:grid-cols-[_1fr_3fr] gap-3">
            <img :src="'img/races/' + char_data.race + '.webp'"
              class="w-full inline-block rounded-lg aspect-square self-center" flex-1 row-span-4 />
            <race-description block>
              {{ current_race.desc }}
            </race-description>
            
            <div bold mt-0 pt-0 text-center self-center>Стартовые значения:</div>
            <stat-container class="grid grid-cols-4">
              <race-stat flex flex-col text-center text-blue-500 my-1 col-span-1>
                <stat-hint text-xs> скорость </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="mdi:arrow-right-bold-hexagon-outline" text-4xl mr-1 inline-block />
                  <div inline-block>{{ current_race.movement }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-amber-300 my-1>
                <stat-hint text-xs> порывов </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="game-icons:fire-dash" text-3xl mr-1 inline-block />
                  <div inline-block>{{ current_race.bursts }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-red-400 my-1>
                <stat-hint text-xs> здоровья </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="healthicons:health" text-4xl mr-1 inline-block />
                  <div inline-block>{{ current_race.max_hp }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-green-300 my-1>
                <stat-hint text-xs> брони </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="game-icons:shoulder-armor" text-4xl mr-1 inline-block />
                  <div inline-block>{{ current_race.armor }}</div>
                </stat-value>
              </race-stat>
            </stat-container>
            <aspects-info p-2  rounded-lg border-1 border-slate-600 flex justify-between
              class="bg-subtle-gradient from-10% to-90% self-end" :class="[
                'from-' + current_race.aspects[0] + '-dark',
                'to-' + current_race.aspects[1] + '-dark'
              ]">
              <span font-bold color-gray-300>{{ $LANG[current_race.aspects[0]] }}</span>
              <span>Связанные Аспекты</span>
              <span font-bold color-gray-300>{{ $LANG[current_race.aspects[1]] }}</span>
            </aspects-info>
          </race-info-block>

          

        </race-info-block>
      </div>
      <button-block v-if="char_data.race != null">
        <fwb-button color="alternative" square @click="resetRace()">
          <template #prefix>
            <Icon icon="mdi:arrow-up-left" text-xl />
          </template>
          Назад
        </fwb-button>
        <fwb-button color="yellow" outline square @click="tabForward()">
          <template #prefix>
            <Icon icon="mdi:arrow-right" text-xl />
          </template>
          Выбрать эту расу
        </fwb-button>
      </button-block>
      <button-block justify-center v-else="char_data.race != null">
        <fwb-button color="yellow" disabled outline square>
          <template #prefix>
            <Icon icon="lucide:mouse-pointer-click" text-xl />
          </template>
          Выберите расу
        </fwb-button>
      </button-block>
    </guide-tab>
    <guide-tab v-else-if="active_tab == 'class'">
      <div v-if="char_data.class == null">
        <h1>Выберите класс</h1>
        <!-- <trait-info v-html="$expandText($CLASSES.scholar.traits[0].levels[0])"/> -->
        <p med>
          Класс - нечто вроде профессии Вашего персонажа. Он определяет его способности и
          приверженность каким-то Аспектам.
        </p>
        <p det>Наёмный убийца - совсем не то же самое, что бравый воин или умелый ремесленник.</p>
        <p det>
          Колдун, призывающий духов и демонические сущности, верит совсем не в то же самое, во что
          учёный-естествознатель. Скальд хорошо разбирается в героических сагах, которыми он
          зажигает сердца людей, но гораздо хуже - в тонкостях жизни диких животных.
        </p>
        <p det>
          Выбирая стартовый класс, Вы получаете также два связанных с ним Аспекта, а ваши значения
          связанных с ними характеристик будут максимальными.
        </p>
        <p med>
          При получении новых уровней, Вы сможете получать новые классы и Аспекты, характеристики и
          умения, но Аспекты противоположные взятым будут для Вас закрыты.
        </p>
        <class-filter flex flex-col my-2 border-1 border-slate-900 rounded-md bg-slate-900 py-2>
          <filter-type flex items-center py-1>
            <h2 class="basis-1/2 text-xl uppercase font-normal" m-0 p-0 self-center text-center basis-0>
              Фильтр:
            </h2>
            <fwb-toggle class="basis-1/3" size="sm" v-model="filter_and" label="Тип" />
            <fwb-toggle class="gender-toggle basis-1/6" size="sm" v-model="male" label="Пол" />
          </filter-type>
          <aspect-filter>
            <aspect-item v-for="(asp, key) in $ASPECTS"
              :class="[class_filter.includes(key) ? ['text-' + key + '-light'] : ['']]"
              @click="toggleAspectFilter(key)">
              <tip>{{ $LANG[key] }}</tip>
              <Icon :icon="asp.icon" />
              <tip>{{ $LANG[asp.attr] }}</tip>
            </aspect-item>
          </aspect-filter>
        </class-filter>
        <classes-list>
          <class-block v-for="(item, key) in classes_filtered" @click="setClass(key)">
            <img :src="'img/portraits/classes/' + key + '_' + (male ? 'm' : 'f') + '.jpg'"
              class="w-full inline-block" />
            <race-short-desc flex justify-center class="bg-subtle-gradient from-10% to-90%"
              :class="['from-' + item.aspects[0] + '-dark', 'to-' + item.aspects[1] + '-dark']">
              <race-name>{{ item.name[gender] }}</race-name>
            </race-short-desc>
          </class-block>
        </classes-list>
      </div>
      <div v-else>
        <h1>{{ current_class.name[gender] }}</h1>
        <class-pics flex gap-2>
          <class-pic rounded-md overflow-hidden border-2 border-slate-600>
            <img :src="'img/portraits/classes/' + current_class.id + '_m.jpg'" />
          </class-pic>
          <class-pic rounded-md overflow-hidden border-2 border-slate-600>
            <img :src="'img/portraits/classes/' + current_class.id + '_f.jpg'" />
          </class-pic>
        </class-pics>
        <p><b>Краткое описание:</b> пока не написал...{{ current_class.desc }}</p>

        <aspects-info p-2 my-2 rounded-lg border-1 border-slate-600 flex justify-between
          class="bg-subtle-gradient from-10% to-90%" :class="[
            'from-' + current_class.aspects[0] + '-dark',
            'to-' + current_class.aspects[1] + '-dark'
          ]">
          <span font-bold color-gray-300>{{ $LANG[current_class.aspects[0]] }}</span>
          <span>Связанные Аспекты</span>
          <span font-bold color-gray-300>{{ $LANG[current_class.aspects[1]] }}</span>
        </aspects-info>
        <p>
          <b>Сильные характеристики:</b>
          <spec-span mr-1 v-for="asp in current_class.aspects" :class="asp">{{
            $LANG[$ASPECTS[asp].attr]
            }}</spec-span>
        </p>
        <p>
          <b>Сильные проверки:</b>
          <spec-span mr-1 v-for="asp in current_class.aspects">
            {{ $LANG[$ASPECTS[asp].checks] }}</spec-span>
        </p>
        <p><b> Умения: </b></p>
        <trait-block v-for="trait in current_class.traits" block>
          <trait-name> {{ trait.name }}</trait-name>
          <ol class="list-decimal ml-4">
            <li v-for="level in trait.levels" v-html="$expandText(level)"></li>
          </ol>
        </trait-block>
      </div>
      <button-block>
        <fwb-button v-if="char_data.class == null" color="alternative" square @click="tabBack()">
          <template #prefix>
            <Icon icon="mdi:arrow-left" text-xl />
          </template>
          К виду
        </fwb-button>
        <fwb-button v-if="char_data.class" color="alternative" square @click="resetClass()">
          <template #prefix>
            <Icon icon="mdi:arrow-up-left" text-xl />
          </template>
          Назад
        </fwb-button>
        <fwb-button v-if="char_data.class" color="yellow" outline square @click="tabForward()">
          <template #prefix>
            <Icon icon="mdi:arrow-right" text-xl />
          </template>
          Выбрать этот класс
        </fwb-button>
      </button-block>
    </guide-tab>
    <guide-tab v-else-if="active_tab == 'profile'">
      <div>
        <h1>Профиль</h1>
        <profile-block flex gap-2>
          <profile-picture aspect-square border border-slate-600 basis-1 grow-1 rounded-md flex items-center
            justify-center bg-slate-700 overflow-hidden @click="showModal()">
            <img v-if="char_data.picture" :src="'img/portraits/' + char_data.picture" />
            <fwb-button v-else color="yellow" outline square> Выбрать портрет </fwb-button>
          </profile-picture>
          <info-block flex flex-col justify-between basis-1 grow-1>
            <fwb-input v-model="char_data.name" placeholder="Имя персонажа" rounded-md />
            <fwb-toggle class="gender-toggle" size="sm" v-model="male" :label="male ? 'Мужчина' : 'Женщина'" />
            <div>Вид: {{ current_race.name }}</div>
            <div>Возраст: {{ age_name }}</div>
          </info-block>
        </profile-block>

        <h2>Происхождение:</h2>

        <origin-block class="rounded-md flex flex-col border px-2 pb-1 border-slate-600 my-2 align-middle">
          <button-block>
            <fwb-button color="alternative" square @click="originModify(-1)">
              <Icon icon="mdi:chevron-left" text-xl />
            </fwb-button>
            <fwb-button color="alternative" square @click="originRand()">
              <Icon icon="mdi:dice-5" text-xl />
            </fwb-button>
            <fwb-button color="alternative" square @click="originModify(1)">
              <Icon icon="mdi:chevron-right" text-xl />
            </fwb-button>
          </button-block>
          <p>
            <b>{{ current_origin.name }}:</b> {{ current_origin.text }}
          </p>
          <p><b>Эффект: </b> {{ current_origin.trait }}</p>
        </origin-block>

        <h2>Возраст персонажа:</h2>
        <p det>В отличие от пола, возраст влияет на многое.</p>
        <p det>
          Совсем юные персонажи полны энергии и имеют целый дополнительный порыв, но ещё не
          научились изучать действительно полезные вещи, потому получают меньше опыта за каждый
          новый уровень. Они двигаются быстрее, легче переживают травмы.
        </p>
        <p det>
          Самые же старые, наоборот, имеют большой запас жизненного опыта, но тело уже начинает их
          подводить. Они начинают игру с дополнительными очками опыта, но сниженной скоростью и
          здоровьем.
        </p>
        <p det>
          Немаловажно так же количество предысторий (жизненных вех) - у юнцов ещё всё впереди, а вот
          те, кто старше, могли успеть побывать солдатами или мастеровыми, путешествовать по далёким
          землям или обзавестись полезными связами. Каждая предыстория даёт небольшое ситуативное
          преимущество, которое может сыграть свою роль в партии.
        </p>
        <ages-block>
          <age-block v-for="(age, key) in $AGES" class="flex rounded-md border py-2 border-slate-600 my-2 align-middle"
            :class="{ 'border-yellow-300 bg-yellow-700/5': char_data.age == key }" @click="char_data.age = key">
            <age-stats flex justify-between flex-wrap>
              <h2 class="basis-1/2 text-xl uppercase font-normal" m-0 p-0 self-center text-center>
                {{ age.name[gender] }}
              </h2>
              <age-stat text-red-400>
                <stat-value>
                  <Icon icon="healthicons:health" />
                  <div inline-block>{{ age.max_hp > 0 ? '+' : '' }}{{ age.max_hp }}</div>
                </stat-value>
                <stat-hint> здоровья </stat-hint>
              </age-stat>
              <age-stat text-blue-500>
                <stat-value>
                  <Icon icon="mdi:arrow-right-bold-hexagon-outline" />
                  <div inline-block>{{ age.movement > 0 ? '+' : '' }}{{ age.movement }}</div>
                </stat-value>
                <stat-hint> скорость </stat-hint>
              </age-stat>
              <age-stat text-amber-300>
                <stat-value>
                  <Icon icon="game-icons:fire-dash" />
                  <div inline-block>{{ age.bursts > 0 ? '+' : '' }}{{ age.bursts }}</div>
                </stat-value>
                <stat-hint> порывов </stat-hint>
              </age-stat>
              <age-stat text-zinc-400>
                <stat-value>
                  <Icon icon="game-icons:upgrade" />
                  <div inline-block>{{ age.bonus_xp }}</div>
                </stat-value>
                <stat-hint> опыта на старте </stat-hint>
              </age-stat>
              <age-stat text-teal-300>
                <stat-value>
                  <Icon icon="game-icons:burning-passion" />
                  <div inline-block>{{ age.xp }}</div>
                </stat-value>
                <stat-hint> за уровень </stat-hint>
              </age-stat>
              <age-stat text-purple-300>
                <stat-value>
                  <Icon icon="game-icons:conqueror" />
                  <div inline-block>{{ age.steps }}</div>
                </stat-value>
                <stat-hint> предысторий </stat-hint>
              </age-stat>
            </age-stats>
          </age-block>
        </ages-block>
        <fwb-modal v-if="modal_shown" @click:outside="closeModal" @close="closeModal" class="modal">
          <template #header>
            <div class="flex items-center text-xl">Выберите подходящий портрет</div>
          </template>
          <template #body class="modal-text">
            <div flex flex-wrap gap-2>
              <portrait-preset v-for="i in 96"
                class="flex-grow basis-1/4 rounded-xl overflow-hidden bg-slate-600/50 cursor-pointer"
                @click="(char_data.picture = 'presets/' + i + '.png'), closeModal()">
                <img :src="'img/portraits/presets/' + i + '.png'" />
              </portrait-preset>
            </div>
          </template>
        </fwb-modal>
        <div text-red-400 text-center v-if="char_data.picture == null">
          Вы не выбрали портрет персонажа.
        </div>
        <div text-red-400 text-center v-if="char_data.name.length < 1">
          Имя персонажа не может быть меньше одного символа.
        </div>
      </div>
      <button-block>
        <fwb-button color="alternative" square @click="tabBack()">
          <template #prefix>
            <Icon icon="mdi:arrow-up-left" text-xl />
          </template>
          Назад
        </fwb-button>
        <fwb-button v-if="char_data.picture != null && char_data.name.length >= 1" color="yellow" outline square
          @click="tabForward()">
          <template #prefix>
            <Icon icon="mdi:arrow-right" text-xl />
          </template>
          Продолжить
        </fwb-button>
        <fwb-button v-else color="red" disabled outline square @click="tabForward()">
          <template #prefix>
            <Icon icon="icon-park-outline:check-correct" text-xl />
          </template>
          Нужно исправить
        </fwb-button>
      </button-block>
    </guide-tab>
    <guide-tab v-if="active_tab == 'stats'">
      <div>
        <h1>Характеристики и умения</h1>
        <p med>
          У всех персонажей в игре есть 6 характеристик, по одной связанной с каждым Аспектом.
        </p>
        <p med>
          Когда персонаж хочет сделать что-то сложное, то в чём можно как преуспеть, так и
          провалиться, мастер просит его пройти Проверку, бросив кубик d12. Есть так же 6 видов этих
          Проверок, по одной на каждый Аспект (и на каждую Характеристику).
        </p>
        <p med>Проходить Проверки проще, если Ваши связанные характеристики выше</p>
        <ul det>
          <li>
            Проверки <span war>Конфликта</span> отвечают за атаку в бою, планирование нападений на
            глобальной карте, открытый физический конфликт в социальных взаимодействиях. Зависит от
            характеристики Мощь, и в меньшей степени от Разума и Восприятия. Если Ваш показатель
            Хитрости значительно выше их, то и от Хитрости.
          </li>
          <li>
            <span knowledge>Порядок</span> отвечает за все попытки организации, ремёсла и науку,
            включая магические искусства. Зависит от Разума, в меньшей степени от Мощи и Харизмы.
            Если Ваш показатель Интуиции значительно выше их, то и от него.
          </li>
          <li>
            <span society>Влиение</span> помогает лучше распознавать эмоции разумных и влиять на
            них. Зависит от характеристики Харизма, и в меньшей степени от Разума и Хитрости. Если
            Ваш показатель Восприятия значительно выше их, то и него.
          </li>
          <li>
            Проверки <span shadow>Тени</span> отвечают за защиту в бою, планирование обороны и засад
            на глобальной карте, хитрые манипуляции и преступные действия. Зависит от характеристики
            Хитрость, и в меньшей степени от Харизмы и Интуиции. Если Ваш показатель Конфликта
            значительно выше их, то и от него.
          </li>
          <li>
            <span mystics>Хаос</span> отвечает за религии и культы, включая тёмное колдовство и
            необъяснимые магические искусства. Зависит от характеристики Интуиция, и в меньшей
            степени от Хитрости и Восприятия. Если Ваш показатель Порядка значительно выше их, то и
            от него.
          </li>
          <li>
            Хороший <span nature>Поиск</span> помогает лучше разбираться в дикой местности,
            естественных науках с ней связанных, передвижение по глобальной карте и способность
            искать на ней то, что Вам нужно. Зависит от характеристики Восприятие, и в меньшей
            степени от Интуиции и Конфликта. Если Ваш показатель Харизмы значительно выше их, то и
            от него.
          </li>
        </ul>
        <p med>
          Самые большие значения, 6 и 4 Вы получаете в характеристиках, связанных с Вашим классом.
          Но можете сами решить, какая из них будет выше:
        </p>
        <attr-block flex flex-col mt-2>
          <div flex justify-center>
            <span mr-1 text-xl v-for="asp in current_class.aspects" :class="asp">
              {{ $LANG[$ASPECTS[asp].attr] }}
              = {{ char_data.attrs[$ASPECTS[asp].attr] }}
            </span>
          </div>
          <button-block flex justify-center mt-0>
            <fwb-button outline color="dark" @click="swapStrongestAttributes">
              Поменять местами
            </fwb-button>
          </button-block>
        </attr-block>
        <p med>
          В характеристиках, противоположных Вашим Аспектам, Вы получаете ноль. Ещё четыре очка
          распределяются по оставшимся характеристикам.
        </p>
        <h2>Выберите умения:</h2>
        <p det>
          Умения - основное что отличает персонажей в TriP. Они дают значительные бонусы или просто
          позволяют делать некоторые вещи, недоступные другим.
        </p>
        <p med>
          Сейчас Вы можете выбрать по одному первоуровневому умению от своего стартового класса и
          двух связанных с ним Аспектов.
        </p>
        <traits-block>
          <template v-for="(item, index) in trait_list">
            <b>{{ item.tip }}</b>
            <trait-block class="rounded-md flex flex-col border px-2 pb-1 border-slate-600 my-2 align-middle">
              <button-block>
                <fwb-button color="alternative" square @click="traitModify(index, -1)">
                  <Icon icon="mdi:chevron-left" text-xl />
                </fwb-button>
                <fwb-button color="alternative" square @click="traitModifyRand(index)">
                  <Icon icon="mdi:dice-5" text-xl />
                </fwb-button>
                <fwb-button color="alternative" square @click="traitModify(index, 1)">
                  <Icon icon="mdi:chevron-right" text-xl />
                </fwb-button>
              </button-block>
              <b>{{ item.traits[trait_scroller[index]].name }}:</b>
              <trait-info v-html="$expandText(item.traits[trait_scroller[index]].levels[0])">
              </trait-info>
            </trait-block>
          </template>
        </traits-block>
      </div>
      <button-block>
        <fwb-button color="alternative" square @click="tabBack()">
          <template #prefix>
            <Icon icon="mdi:arrow-up-left" text-xl />
          </template>
          Назад
        </fwb-button>
        <fwb-button color="yellow" outline square @click="tabForward()">
          <template #prefix>
            <Icon icon="mdi:arrow-right" text-xl />
          </template>
          Продолжить
        </fwb-button>
      </button-block>
    </guide-tab>
    <guide-tab v-if="active_tab == 'equip'">
      <div>
        <h1>Снаряжение</h1>
        <p med>Теперь Вам нужно выбрать стартовое снаряжение Вашего персонажа.</p>
        <p det>
          Вместо точного подсчёта количества золотых-серебряных и прочих монет, в TriP используются
          абстрактные уровни благополучия, или Богатства. Имея уровень Богатства 5, Вы можете
          свободно в больших (в разумных пределах) покупать предметы 4 и ниже уровня стоимости, либо
          купить 1-2 предмета в месяц из своего, пятого уровня.
        </p>
        <p det>
          Раз в месяц Вы можете купить нечто, что Вам не по карману (на один уровень выше), но после
          этого будете вынуждены жить на хлебе и воде (опуститесь на один уровень ниже).
        </p>
        <p det>
          К счастью, имея постоянный доход какого-то уровня, Вы за 3 месяца подниметесь на
          соответствующий уровень Богатства
        </p>
        <p>
          Посоветуйтесь с Вашим мастером о том, какой стартовый уровень Богатства допустим для
          Вашего персонажа.
        </p>
        <p>
          В большинстве случаев, он может определяться с помощью броска кубика d6. Для этого
          прибавьте половину выпавшего значения к трём и округлите результат в меньшую сторону.
        </p>
        <p det>
          Например, если на кубике выпало 5, формула получается следующей: 5/2 + 3 = 5.5, после
          округления в меньшую сторону получается уровень Богатства 5.
        </p>
        <wealth-block id="wealth"
          class="text-center rounded-md flex flex-col border px-2 pb-0 border-slate-600 my-2 align-middle">
          <button-block>
            <fwb-button color="alternative" square @click="wealthModify(-10)">
              <Icon icon="mdi:chevron-left" text-xl />
            </fwb-button>
            <fwb-button color="alternative" square @click="wealthRand()">
              <Icon icon="mdi:dice-5" text-xl />
            </fwb-button>
            <fwb-button color="alternative" square @click="wealthModify(10)">
              <Icon icon="mdi:chevron-right" text-xl />
            </fwb-button>
          </button-block>
          <h2 pt-0 mt-0 mb-1>{{ current_wealth }}</h2>
        </wealth-block>
        <p>От Вашего кошелька зависит выбор снаряжения.</p>
        <p med>
          Простое оружие и кое-какая броня доступны на третьем уровне Богатства, а вот предметы
          изготовленные специально для войны - только на пятом.
        </p>
        <p det>
          Главное отличие этих категорий предметов - простое оружие не может наносить травмы тяжелее
          лёгких. Это совсем не значит, что с его помощью не получится кого-то убить! Убить можно и
          голыми руками, вот только с воинским оружием для этого потребуется значительно меньше
          ударов.
        </p>
        <p det>
          Однако, воинское оружие всё ещё не гарантия победы над противником, чтобы нанести более
          тяжёлые травмы врагу Ваша атака должна значительно превзойти его защиту. Разве что простое
          оружие даже при большом превышении не сможет нанести серьёзную рану, а воинское - сможет.
        </p>
        <p med>
          Не беспокойтесь о покупке ножа для нарезки хлеба или иных бытовых принадлежностей. По
          умолчанию считается что у все предметы такого рода у Вас уже есть.
        </p>
        <h2>Доспех</h2>
        <p med>
          В бой Вы сможете брать только два набора снаряжения и один доспех. Например, лук со
          стрелами для дальнего боя и меч с щитом для ближнего.
        </p>
        <armor-block class="text-center rounded-md flex flex-col border px-2 pb-0 border-slate-600 my-2 mt-4 align-middle">
          <button-block items-center>
            <fwb-button color="alternative" square @click="armorModify(-1)">
              <Icon icon="mdi:chevron-left" text-xl />
            </fwb-button>
            <b>{{ current_armor.name }}</b>
            <fwb-button color="alternative" square @click="armorModify(1)">
              <Icon icon="mdi:chevron-right" text-xl />
            </fwb-button>
          </button-block>

          <div flex gap-3 my-2 v-if="current_armor.key != 'none'">
            <img :src="'img/items/' + current_armor.key + '.png'" aspect-square
              class="w-1/2 md:w-1/3 flex-shrink border-1 rounded-md border-slate-600 bg-slate-700/50" />
            <armor-stats class="w-1/2 md:w-2/3 flex-shrink grid grid-cols-2">
              <armor-stat-block>
                <tip>Защита</tip>
                <div>
                  <Icon icon="grommet-icons:shield" />
                  <armor-stat> {{ current_armor.defence }} </armor-stat>
                </div>
              </armor-stat-block>
              <armor-stat-block>
                <tip>Снижение</tip>
                <div>
                  <Icon icon="game-icons:shoulder-armor" />
                  <armor-stat> {{ current_armor.resist }} </armor-stat>
                </div>
              </armor-stat-block>
              <armor-stat-block>
                <tip>Скорость</tip>
                <div>
                  <Icon icon="mdi:arrow-right-bold-hexagon-outline" />
                  <armor-stat> {{ current_armor.movement }} </armor-stat>
                </div>
              </armor-stat-block>
              <armor-stat-block>
                <tip>Порывы</tip>
                <div>
                  <Icon icon="game-icons:fire-dash" />
                  <armor-stat> {{ current_armor.bursts }} </armor-stat>
                </div>
              </armor-stat-block>
              <armor-stat-block>
                <tip>Цена</tip>
                <div>
                  <Icon icon="iconoir:coins" />
                  <armor-stat> {{ current_armor.price }} </armor-stat>
                </div>
              </armor-stat-block>
              <armor-stat-block>
                <tip>Эпоха</tip>
                <div>
                  <Icon icon="icon-park-outline:level" />
                  <armor-stat> {{ current_armor.epoch }} </armor-stat>
                </div>
              </armor-stat-block>
            </armor-stats>
          </div>
          <armor-desc text-left v-if="current_armor.key != 'none'">
            {{ current_armor.desc }}
          </armor-desc>
          <armor-price flex border border-slate-600 rounded-md my-2 p-2 justify-between
            v-if="current_armor.key != 'none'">
            <div>Цена для Вас:</div>

            <fwb-tooltip>
              <template #trigger>
                <div flex items-center :class="countPrice(current_armor.price).type">
                  {{ current_armor.price_type.name }}
                  <Icon icon="mdi:question-box-multiple-outline" ml-3 text-base />
                </div>
              </template>
              <template #content>
                {{ current_armor.price_type.tip }}
              </template>
            </fwb-tooltip>
          </armor-price>
        </armor-block>
        <h2>Оружие</h2>
        <p med>
          Теперь Вам нужно выбрать несколько предметов оружия, которые Вы возьмёте с собой. Даже
          если Вы совсем не планируете участвовать в битвах, небольшая предосторожность не будет
          лишней.
        </p>
        <p med>
          Бой в TriP смертоносен и скоротечен, если Вы хотите сохранить жизнь своего персонажа -
          задумайтесь о защите. Исторически главным атрибутом воина был не меч или топор, а щит.
          Любой воин хочет в первую очередь выжить, и лишь затем - нанести потери врагу.
        </p>
        <p det>
          Вы можете взять два оружия в две руки, хотя и есть некоторые ограничения на этот счёт.
          Так, оружие делится на длинное и короткое, не получится использовать два длинных
          одновременно.
        </p>
        <p det>
          Конечно же, оружие делится на одноручное и двуручное, а кроме того в системе TriP есть
          условные 0.5 и 1.5-ручное оружие. Хорошим примером может послужить лёгкий одноручный
          арбалет, который нужно перезаряжать второй рукой. При этом, вполне допустимо, чтобы во
          второй руке оказывался небольшой предмет, не сильно сковывающий движение (например кинжал
          или баклер)
        </p>
        <hand-items-filter flex flex-col px-2 py-1 rounded-md my-2 border border-slate-600 class="bg-slate-700/30">
          <price-filter flex flex-col items-center>
            <button-block items-center justify-between w-full>
              <fwb-button color="alternative" square @click="priceFilterModify(-1)">
                <Icon icon="mdi:chevron-left" text-xl />
              </fwb-button>
              <div flex flex-col items-center>
                <tip>Максимальная цена:</tip>
                <b text-sm>{{ price_filter }} - {{ $WEALTHS[price_filter].name }}</b>
              </div>
              <fwb-button color="alternative" square @click="priceFilterModify(1)">
                <Icon icon="mdi:chevron-right" text-xl />
              </fwb-button>
            </button-block>
          </price-filter>
          <epoch-filter>
            <button-block items-center justify-between w-full>
              <fwb-button color="alternative" square @click="epochFilterModify(-1)">
                <Icon icon="mdi:chevron-left" text-xl />
              </fwb-button>
              <div flex flex-col items-center>
                <tip>Максимальная эпоха:</tip>
                <b text-sm>{{ epoch_filter }} - {{ $EPOCHS[epoch_filter].name }}</b>
              </div>
              <fwb-button color="alternative" square @click="epochFilterModify(1)">
                <Icon icon="mdi:chevron-right" text-xl />
              </fwb-button>
            </button-block>
          </epoch-filter>
          <weapon-type-filter flex justify-between my-1>
            <Icon v-for="item, key in $ITEM_TYPES" :icon="item.icon" class="text-gray-200/30"
              :class="type_filter.includes(key) ? 'text-gray-200/80' : ''" @click="toggleWeaponTypeFilter(key)"
              text-3xl />
          </weapon-type-filter>
        </hand-items-filter>
        <hand-items  class="grid grid-cols-3 gap-2 items-stretch md:grid-cols-6 lg:grid-cols-9">
          <hand-item-block relative v-for="item in hand_items"
            class="w-full flex-grow aspect-1/2 border border-slate-600 rounded-md bg-slate-700/50 z-10" :class="[
              item.small != null ? item.small : 'p-2',
              char_data.items_taken.includes(item.key) ? countPrice(item.price).type : ''
            ]" pb-8 @click="showWeaponModal(item)">
            <hand-item-img inline-block w-full h-full class="place-self-center self-center" :style="'background: url(\'img/items/' +
              item.key +
              '.png\'); background-size: contain; background-position: center center; background-repeat: no-repeat;'
              " />

            <hand-item-stat top-0 left-0 rounded-tl-md rounded-br-md>
              <fwb-tooltip>
                <template #trigger>
                  <div flex items-center>
                    <Icon icon="iconoir:coins" />
                    <hand-item-stat-value>
                      {{ item.price }}
                    </hand-item-stat-value>
                  </div>
                </template>
                <template #content>
                  Цена: {{ item.price }}, для Вас
                  <span :class="countPrice(item.price).type">{{
                    countPrice(item.price).name
                    }}</span>
                </template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat top-0 right-0 rounded-bl-md rounded-tr-md>
              <fwb-tooltip>
                <template #trigger>
                  <div flex items-center>
                    <Icon icon="icon-park-outline:level" />
                    <hand-item-stat-value>
                      {{ item.epoch }}
                    </hand-item-stat-value>
                  </div>
                </template>
                <template #content> Появляется в эпохе {{ item.epoch }} </template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-statblock absolute bottom-0 left-0 right-0 flex justify-between rounded-bl-md rounded-br-md
              class="bg-slate-600/50 z-0">
              <hand-item-stat v-if="item.attack != null">
                <fwb-tooltip>
                  <template #trigger>
                    <div flex items-center>
                      <Icon icon="game-icons:arrow-scope" />
                      <hand-item-stat-value>
                        {{ item.attack }}
                      </hand-item-stat-value>
                    </div>
                  </template>
                  <template #content> Модификатор атаки: {{ item.attack }} </template>
                </fwb-tooltip>
              </hand-item-stat>
              <template v-if="typeof item.defence == 'object'">
                <hand-item-stat>
                  <fwb-tooltip>
                    <template #trigger>
                      <div flex items-center>
                        <Icon icon="grommet-icons:shield" />
                        <hand-item-stat-value>
                          {{ item.defence.front.melee }}
                        </hand-item-stat-value>
                      </div>
                    </template>
                    <template #content>
                      Модификатор защиты от ударов в ближнем бою: {{ item.defence.front.melee }}
                    </template>
                  </fwb-tooltip>
                </hand-item-stat>
                <hand-item-stat>
                  <fwb-tooltip>
                    <template #trigger>
                      <div flex items-center>
                        <Icon icon="game-icons:arrows-shield" />
                        <hand-item-stat-value>
                          {{ item.defence.front.ranged }}
                        </hand-item-stat-value>
                      </div>
                    </template>
                    <template #content>
                      Модификатор защиты от ударов в ближнем бою: {{ item.defence.front.ranged }}
                    </template>
                  </fwb-tooltip>
                </hand-item-stat>
              </template>
              <hand-item-stat v-else-if="item.defence != null">
                <fwb-tooltip>
                  <template #trigger>
                    <div flex items-center>
                      <Icon icon="grommet-icons:shield" />
                      <hand-item-stat-value>
                        {{ item.defence }}
                      </hand-item-stat-value>
                    </div>
                  </template>
                  <template #content> Модификатор атаки: {{ item.attack }} </template>
                </fwb-tooltip>
              </hand-item-stat>
            </hand-item-statblock>
          </hand-item-block>
        </hand-items>
        <money-estimation text-center>
          <h2>Подсчёт финансов:</h2>
          <a ml-0 pl-0 block :href="money_estimation.link"
            :class="money_estimation.correct ? 'text-green-400' : 'text-red-400'">{{ money_estimation.tip }}
          </a>
        </money-estimation>
      </div>
      <button-block>
        <fwb-button color="alternative" square @click="tabBack()">
          <template #prefix>
            <Icon icon="mdi:arrow-left" text-xl />
          </template>
          Умения
        </fwb-button>
        <fwb-button v-if="money_estimation.correct" color="yellow" outline square @click="finishCharCreation()">
          <template #prefix>
            <Icon icon="ic:outline-celebration" text-xl />
          </template>
          Создать персонажа!
        </fwb-button>
        <fwb-button v-else disabled color="red" outline square>
          <template #prefix>
            <Icon icon="icon-park-outline:check-correct" text-xl />
          </template>
          Нужны исправления
        </fwb-button>
      </button-block>
    </guide-tab>
    <fwb-modal v-if="weapon_modal_shown" @click:outside="closeWeaponModal" @close="closeWeaponModal" class="modal">
      <template #header>
        <div class="flex items-center text-xl">{{ modal_weapon.name }}</div>
      </template>
      <template #body class="modal-text">
        <div flex>
          <weapon-item-block inline-block w-24 h-48 class="border-slate-600 rounded-md bg-slate-800/50"
            :class="modal_weapon.small != null ? modal_weapon.small : 'p-1'">
            <hand-item-img inline-block w-full h-full :style="'background: url(\'img/items/' +
              modal_weapon.key +
              '.png\'); background-size: contain; background-position: center center; background-repeat: no-repeat;'
              " />
          </weapon-item-block>
          <weapon-stats grid grid-cols-3 w-full>
            <hand-item-stat v-if="modal_weapon.attack != null">
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Атака</tip>
                    <div flex items-center>
                      <Icon icon="game-icons:arrow-scope" />
                      <hand-item-stat-value>
                        {{ modal_weapon.attack }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content> Модификатор атаки: {{ modal_weapon.attack }} </template>
              </fwb-tooltip>
            </hand-item-stat>
            <template v-if="typeof modal_weapon.defence == 'object'">
              <hand-item-stat>
                <fwb-tooltip class="justify-center">
                  <template #trigger>
                    <div flex flex-col items-center>
                      <tip>Удары</tip>
                      <div flex items-center>
                        <Icon icon="grommet-icons:shield" />
                        <hand-item-stat-value>
                          {{ modal_weapon.defence.front.melee }}
                        </hand-item-stat-value>
                      </div>
                    </div>
                  </template>
                  <template #content>
                    Защита от атак в ближнем бою {{ modal_weapon.defence.front.melee }}
                  </template>
                </fwb-tooltip>
              </hand-item-stat>
              <hand-item-stat>
                <fwb-tooltip class="justify-center">
                  <template #trigger>
                    <div flex flex-col items-center>
                      <tip>Снаряды</tip>
                      <div flex items-center>
                        <Icon icon="game-icons:arrows-shield" />
                        <hand-item-stat-value>
                          {{ modal_weapon.defence.front.ranged }}
                        </hand-item-stat-value>
                      </div>
                    </div>
                  </template>
                  <template #content>
                    Защита дистанционных атак {{ modal_weapon.defence.front.ranged }}
                  </template>
                </fwb-tooltip>
              </hand-item-stat>
            </template>
            <hand-item-stat v-else>
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Защита</tip>
                    <div flex items-center>
                      <Icon icon="grommet-icons:shield" />
                      <hand-item-stat-value>
                        {{ modal_weapon.defence }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content>
                  Защита от атак в ближнем бою {{ modal_weapon.defence }}
                </template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat v-if="modal_weapon.armor_pen">
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Пробитие</tip>
                    <div flex items-center>
                      <Icon icon="game-icons:cracked-helm" />
                      <hand-item-stat-value>
                        {{ modal_weapon.armor_pen }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content>
                  Некоторые виды оружия игнорируют один или несколько уровней брони</template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat v-if="modal_weapon.length != null" style="grid-column-start: 1">
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Дальность</tip>
                    <div flex items-center>
                      <Icon icon="mdi:hexagon-multiple-outline" />
                      <hand-item-stat-value>
                        {{ modal_weapon.length }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content>
                  Длинные виды оружия без штрафа бьют через клетку и со штрафом в две категории - по
                  целям вплотную к себе. Короткие - наоборот.</template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat>
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Руки</tip>
                    <div flex items-center>
                      <Icon icon="game-icons:hand" />
                      <hand-item-stat-value>
                        {{ modal_weapon.hands }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content>
                  Чтобы пользоваться одним оружием достаточно одной руки, другому нужны две, в
                  редких случаях нужно чтобы вторая рука не была занята чем-то тяжёлым (например,
                  при перезарядке ручного арбалета)</template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat style="grid-column-start: 1">
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Цена</tip>
                    <div flex items-center>
                      <Icon icon="iconoir:coins" />
                      <hand-item-stat-value>
                        {{ modal_weapon.price }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content>
                  Цена: {{ modal_weapon.price }}, для Вас
                  <span :class="countPrice(modal_weapon.price).type">{{
                    countPrice(modal_weapon.price).name
                    }}</span>
                </template>
              </fwb-tooltip>
            </hand-item-stat>
            <hand-item-stat>
              <fwb-tooltip class="justify-center">
                <template #trigger>
                  <div flex flex-col items-center>
                    <tip>Эпоха</tip>
                    <div flex items-center>
                      <Icon icon="icon-park-outline:level" />
                      <hand-item-stat-value>
                        {{ modal_weapon.epoch }}
                      </hand-item-stat-value>
                    </div>
                  </div>
                </template>
                <template #content> Появляется в эпохе {{ modal_weapon.epoch }} </template>
              </fwb-tooltip>
            </hand-item-stat>
          </weapon-stats>
        </div>
        {{ modal_weapon.desc }}
        <template v-if="modal_weapon.spec && modal_weapon.spec.length > 0">
          <b> Особенности: </b>
          {{ modal_weapon.spec }}
        </template>

        <fwb-table striped v-if="modal_weapon.damage != null"
          class="overflow-hidden rounded-lg mt-2 border border-slate-700">
          <fwb-table-head class="">
            <fwb-table-head-cell width="20%" class="bg-slate-800/30">Превышение защиты</fwb-table-head-cell>
            <fwb-table-head-cell width="80%" class="bg-slate-800/30 text-right">Эффект</fwb-table-head-cell>
          </fwb-table-head>
          <fwb-table-body>
            <fwb-table-row v-for="(text, score) in modal_weapon.damage"
              class="dark:even:bg-slate-700/50 dark:odd:bg-slate-700/20">
              <fwb-table-cell class="py-2">{{ score }}</fwb-table-cell>
              <fwb-table-cell class="py-2">{{ text }}</fwb-table-cell>
            </fwb-table-row>
          </fwb-table-body>
        </fwb-table>
        <button-block justify-center gap-3>
          <fwb-button v-if="char_data.items_taken.includes(modal_weapon.key)" color="alternative" square
            @click="dropItem(modal_weapon.key)">
            Выбросить
          </fwb-button>
          <fwb-button v-else color="yellow" outline square @click="takeItem(modal_weapon.key)">
            Взять
          </fwb-button>
          <fwb-button color="alternative" square @click="closeWeaponModal"> Закрыть </fwb-button>
        </button-block>
      </template>
    </fwb-modal>
  </new-char-guide>
</template>

<style>
@media (min-width: 1024px) {}

tab-control {
  @apply flex flex-col items-center cursor-pointer text-gray-400;
}

tab-control.done {
  @apply text-yellow-300;
}

tab-control.active,
tab-control.done.active {
  @apply text-gray-50;
}

tab-control svg {
  @apply text-3xl;
}

tab-control tip {
  font-size: 0.6rem;
}

guide-tab {
  @apply pb-16 flex flex-col justify-between;
  min-height: calc(100vh - 4rem);
}

classes-list,
races-list {
  @apply grid grid-cols-3 md:grid-cols-6 items-stretch align-middle gap-1 md:gap-3;

}

classes-list class-block,
races-list race-block {
  @apply rounded-md overflow-hidden bg-slate-700 border-2 border-gray-900 mb-2 cursor-pointer;
  /* @apply grow max-w-[32%]; */
}

age-stat {
  @apply flex flex-col text-center basis-1/5 grow;
}

age-stat stat-value {
  @apply text-lg flex justify-center items-center;
}

age-stat stat-value svg {
  @apply text-xl mr-1 inline-block;
}

age-stat stat-hint {
  @apply text-[0.6rem];
}

.h-modal>div>div>div.p-6 {
  @apply px-2;
}

.gender-toggle>input+span {
  @apply dark:bg-red-400;
}

.gender-toggle>input:checked+span {
  @apply dark:peer-checked:bg-blue-400;
}

aspect-filter {
  @apply flex justify-between;
}

aspect-filter aspect-item {
  @apply rounded-md overflow-hidden flex flex-col items-center basis-1 grow;
}

aspect-filter aspect-item tip {
  @apply text-[0.6rem];
}

aspect-filter aspect-item svg {
  @apply text-3xl;
}

class-filter filter-type span.ml-3 {
  margin-left: 4px;
  margin-right: 12px;
}

armor-image {
  @apply block aspect-square bg-white basis-10 flex-grow;
}

armor-stat-block {
  @apply flex flex-col justify-center items-stretch px-2;
}

armor-stat-block div {
  @apply flex justify-center gap-1 items-center text-xl;
}

armor-stat-block armor-stat {
  @apply text-xl ml-1;
}

hand-item-block hand-item-stat {
  @apply absolute bg-slate-600/50 aspect-square flex items-center px-0.5 text-xs z-10;
}

hand-item-img {
  @apply z-10;
}

hand-item-block.ok_price hand-item-statblock hand-item-stat,
hand-item-block.small_price hand-item-statblock hand-item-stat,
hand-item-block.big_price hand-item-statblock hand-item-stat,
hand-item-block.huge_price hand-item-statblock hand-item-stat {
  @apply bg-transparent;
}

hand-item-block.small_price {
  @apply border-lime-400/20 bg-lime-200/10;
}

hand-item-block.small_price hand-item-statblock {
  @apply bg-lime-400/10;
}

hand-item-block.small_price hand-item-stat {
  @apply bg-lime-400/10;
}

hand-item-block.ok_price {
  @apply border-yellow-200/40 bg-yellow-200/10;
}

hand-item-block.ok_price hand-item-statblock {
  @apply bg-yellow-200/20;
}

hand-item-block.ok_price hand-item-stat {
  @apply bg-yellow-200/20;
}

hand-item-block.big_price {
  @apply border-orange-400/40 bg-orange-200/10;
}

hand-item-block.big_price hand-item-statblock {
  @apply bg-orange-400/20;
}

hand-item-block.big_price hand-item-stat {
  @apply bg-orange-400/20;
}

hand-item-block.huge_price {
  @apply border-red-600/40 bg-red-600/10;
}

hand-item-block.huge_price hand-item-statblock {
  @apply bg-red-600/20;
}

hand-item-block.huge_price hand-item-stat {
  @apply bg-red-600/20;
}

hand-item-stat svg {
  @apply mr-1;
}

hand-item-statblock {
  @apply py-1;
}

hand-item-statblock hand-item-stat {
  @apply bg-transparent static aspect-auto;
}

weapon-stats hand-item-stat {
  @apply static bg-transparent text-2xl;
}

.small_price {
  @apply text-green-300;
}

.ok_price {
  @apply text-yellow-300;
}

.big_price {
  @apply text-orange-400;
}

.huge_price {
  @apply text-red-500;
}

html td.px-6 {}

html .v-popper--theme-tooltip-dark .v-popper__wrapper div.v-popper__inner {
  @apply bg-slate-700 text-gray-100/80;
}

html .v-popper--theme-tooltip-dark .v-popper__wrapper div.v-popper__arrow-container div.v-popper__arrow-outer {
  @apply border-slate-700;
}

html .v-popper--theme-tooltip-dark .v-popper__wrapper {
  @apply mx-4;
}

div.modal div.fixed.bg-opacity-50 {
  @apply bg-slate-900/90 bottom-0 top-0;
}

div.modal div.max-w-2xl.relative.p-4.w-full.h-full {
  @apply px-2;
}

div.modal div.max-w-2xl.relative.p-4.w-full.h-full div.relative.bg-white.rounded-lg {
  @apply absolute left-2 bottom-2 right-2 bg-slate-800;
}

div.modal div.h-modal {
  height: 100%;
}

armor-block, wealth-block, trait-block {
  @apply md:w-1/2 my-4 m-auto;
}
</style>
