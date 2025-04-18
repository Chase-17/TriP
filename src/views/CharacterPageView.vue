<script setup>
import $DIFFS from '../data/diffs.js'
import $ITEMS from '../data/items.js'
import $ITEM_TYPES from '../data/item_types.js'
import $CLASSES from '../data/classes.js'
import $ASPECTS from '../data/aspects.js'
import $LANG from '../data/ru.js'

</script>

<script>
export default {
  data: () => ({
    char: null,
    isShowModal: false,
    check_success: null,
    weapon_edit: null,
  }),
  methods: {
    closeModal() {
      this.isShowModal = false;
    },
    checkSuccess() {
      this.isShowModal = true;
      this.check_success = true;
    },
    checkFail() {
      this.isShowModal = true;
      this.check_success = false;
    },
    async checkRoll(diff) {
      let checkSuccess = null;
      if (diff < 2) {
        return this.checkSuccess();
      } else if (diff > 12) {
        return this.checkFail()
      } else {
        let expr = `1d12`;
        let test = this.$initiateRoll({ expr: expr }).then((res) => {
          if (res.total >= diff)
            return this.checkSuccess();
          else return this.checkFail();
        });
      }
    },
    selectAllItems() {
      let result = [{ value: null, name: 'Ничего' }];
      this.char.items.forEach((e, index) => {
          result.push({ value: index, name: e.name });
      });
      return result;
    },
    selectItems(equip, hand) {
      let other = (hand == 'left' ? 'right' : 'left');
      let other_item = this.char.items[this.char.equips[equip][other]];

      let result = [{ value: null, name: 'Ничего' }];

      if (typeof other_item == 'undefined') {
        this.char.items.forEach((e, index) => {
          if (e.subcat == 'shields' && hand == 'right') return;
          result.push({ value: index, name: e.name });
        })
      } else {
        this.char.items.forEach((e, index) => {
          if (e.subcat == 'shields' && hand == 'right') return;
          if (other_item.hands + e.hands > 2) return;
          if (other_item.length > 1 && e.length > 1) return;
          result.push({ value: index, name: e.name });
        })
      }

      return result;
    },
  },
  computed: {
    // selectItemsCurrentLeft(){
    //   return this.selectItems('current', 'left');
    // },
    // selectItemsCurrentRight(){
    //   return this.selectItems('current', 'right');
    // },
    // selectItemsSecLeft(){
    //   return this.selectItems('secondary', 'left');
    // },
    // selectItemsSecRight(){
    //   return this.selectItems('secondary', 'right');
    // },

  },
  mounted() {
    this.char = this.$CHARS.value[this.$route.params.charKey];
  },
}

</script>

<template>
  <main my-2 v-if="char !== null">
    <character-block flex gap-3 mb-2>
      <portrait-block class="w-1/2">
        <img :src="'../img/portraits/' + char.picture" border-2 rounded-md border-slate-600 class="bg-slate-700/50">
      </portrait-block>
      <character-info flex flex-col flex-grow items-center justify-between>
        <character-name text-3xl uppercase font-bold py-0>
          {{ char.name }}
        </character-name>
        <character-data grid grid-cols-2 gap-1 place-items-center w-full>
          <fwb-tooltip text-3xl placement="bottom">
            <template #trigger>
              <div flex items-center>
                <Icon icon="game-icons:shoulder-armor" mr-1 />
                <hand-item-stat-value>
                  {{ char.computed.resist }}
                </hand-item-stat-value>
              </div>
            </template>
            <template #content>
              Каждый уровень сопротивления урону снижает весь входящий урон по Вам на целую категорию. Тяжёлое ранение
              превращается в лёгкое, лёгкое - в царапину.
            </template>
          </fwb-tooltip>
          <fwb-tooltip text-3xl placement="bottom">
            <template #trigger>
              <div flex items-center>
                <Icon icon="mdi:arrow-right-bold-hexagon-outline" mr-1 />
                <hand-item-stat-value>
                  {{ char.computed.moves }}
                </hand-item-stat-value>
              </div>
            </template>
            <template #content>
              Столько клеток Ваш персонаж может пройти за один ход
            </template>
          </fwb-tooltip>
          <fwb-tooltip text-3xl placement="bottom">
            <template #trigger>
              <div flex items-center>
                <Icon icon="game-icons:fire-dash" mr-1 />
                <hand-item-stat-value>
                  {{ char.max_bursts }}
                </hand-item-stat-value>
              </div>
            </template>
            <template #content>
              Порывы - универсальная "валюта" действий Вашего персонажа в бою, их можно тратить на усиление атаки или
              защиты, на дополнительное движение.
            </template>
          </fwb-tooltip>
          <fwb-tooltip text-3xl placement="bottom">
            <template #trigger>
              <div flex items-center>
                <Icon icon="game-icons:rank-3" mr-1 />
                <hand-item-stat-value>
                  {{ char.level }}
                </hand-item-stat-value>
              </div>
            </template>
            <template #content>
              Уровень персонажа
            </template>
          </fwb-tooltip>
        </character-data>
        <fwb-button color='yellow' outline w-full>Поднять уровень</fwb-button>
      </character-info>
    </character-block>

    <checks-table flex w-full my-1 border-2 rounded-md border-slate-700 items-stretch class="">
      <check-name-column class="w-2/5 h-full" flex-grow grid grid-cols-1 text-xl>
        <check-header flex justify-left items-center class='h-[35px]' pl-2>
          Навыки:
        </check-header>
        <template v-for="([key, asp], index) in Object.entries($ASPECTS)">
          <check-name flex justify-left items-center class='h-[35px]' :class="index % 2 == 0 ? 'bg-slate-600/30' : ''"
            pl-2>
            <Icon :icon="asp.check_icon" :class="`text-${asp.id}-light`" mr-2 />
            <span text-lg>
              {{ $LANG[asp.checks] }}
            </span>
          </check-name>
        </template>
      </check-name-column>
      <check-diff-column class="w-3/5 no-scrollbar " flex-grow overflow-x-auto text-xl>
        <check-diff-table h-full grid style="grid-template-columns: repeat(16, minmax(0, 1fr)); width: 1200px"
          justify-end>
          <template v-for="(check, diff) in $DIFFS">

            <fwb-tooltip text-xl placement="bottom" flex justify-center items-center
              :style="['border: none; border-left: 2px solid; border-color:' + check.linecolor + '; border-left-style: ' + check.linetype, check.linetype == 'double' ? 'border-left-width:4px;' : '']"
              class='h-[35px]'>
              <template #trigger>
                <div flex flex-col items-center justify-center :class="check.class">
                  {{ check.short }}
                </div>
              </template>
              <template #content>
                {{ check.name }}
              </template>
            </fwb-tooltip>
          </template>
          <template v-for="([key, asp], index) in Object.entries($ASPECTS)">
            <template v-for="(check, diff) in $DIFFS">
              <check-diff @click="checkRoll(diff - char.checks[asp.checks])" text-right flex justify-center items-center
                font-semibold
                :style="['border: none; border-left: 2px solid; border-color:' + check.linecolor + '; border-left-style: ' + check.linetype, check.linetype == 'double' ? 'border-left-width:4px;' : '']"
                :class="index % 2 == 0 ? 'bg-slate-600/20' : ''" class='h-[35px]'>
                <Icon icon="icomoon-free:cross" v-if="diff - char.checks[asp.checks] > 12" text-base
                  class="text-red-300/70" />
                <Icon icon="fa:check" v-else-if="diff - char.checks[asp.checks] < 2" text-base
                  class="text-green-300/70" />
                <template v-else>{{ diff - char.checks[asp.checks] }}</template>
              </check-diff>
            </template>
          </template>
        </check-diff-table>
      </check-diff-column>
    </checks-table>
    <defence-table grid class="grid-cols-[1fr_2fr_2fr]">
      <def-corner>Защита </def-corner>
      <def-header>Удары</def-header>
      <def-header>Снаряды</def-header>
      <def-row-head>Фронт </def-row-head>
      <def-cat-value :class="char.computed.defence_cats.front.melee.class">
        {{ char.computed.defence_cats.front.melee.name }}
      </def-cat-value>
      <def-cat-value :class="char.computed.defence_cats.front.ranged.class">
        {{ char.computed.defence_cats.front.ranged.name }}
      </def-cat-value>
      <def-row-head>Фланг </def-row-head>
      <def-cat-value :class="char.computed.defence_cats.side.melee.class">
        {{ char.computed.defence_cats.side.melee.name }}
      </def-cat-value>
      <def-cat-value :class="char.computed.defence_cats.side.ranged.class">
        {{ char.computed.defence_cats.side.ranged.name }}
      </def-cat-value>
      <def-row-head>Тыл </def-row-head>
      <def-cat-value :class="char.computed.defence_cats.back.melee.class">
        {{ char.computed.defence_cats.back.melee.name }}
      </def-cat-value>
      <def-cat-value :class="char.computed.defence_cats.back.ranged.class">
        {{ char.computed.defence_cats.back.ranged.name }}
      </def-cat-value>

    </defence-table>
    <div det>

      <attrs-block grid grid-cols-7 place-items-center place-content-middle p-1 my-1 border-2 rounded-md
        border-slate-700 class="bg-slate-700/40">
        <fwb-tooltip text-xl placement="bottom">
          <template #trigger>
            <div flex flex-col items-center justify-center>
              Асп:
            </div>
          </template>
          <template #content>
            Аспект
          </template>
        </fwb-tooltip>

        <fwb-tooltip text-3xl placement="bottom" v-for="asp in $ASPECTS">
          <template #trigger>
            <div flex flex-col items-center justify-center>
              <Icon :icon="asp.icon" :class="`text-${asp.id}-light`" />
              <Icon v-if="char.aspects.includes(asp.id)" icon="lets-icons:check-fill" text-2xl text-green-400 />
              <Icon v-else icon="charm:cross" text-2xl text-red-400 />
            </div>
          </template>
          <template #content>
            Аспект "{{ asp.name }}", у этого персонажа {{ char.aspects.includes(asp.id) ? "есть" : "нет" }}
          </template>
        </fwb-tooltip>

        <fwb-tooltip text-xl placement="bottom">
          <template #trigger>
            <div flex flex-col items-center justify-center>
              Хар:
            </div>
          </template>
          <template #content>
            Характеристики
          </template>
        </fwb-tooltip>
        <fwb-tooltip text-lg placement="bottom" v-for="asp in $ASPECTS">
          <template #trigger>
            <div flex items-center justify-center :class="`text-${asp.id}-light`">
              <Icon :icon="asp.attr_icon" mr-2 />
              {{ char.attrs[asp.attr] }}
            </div>
          </template>
          <template #content>
            Значение характеристики {{ $LANG[asp.attr] }} этого персонажа - {{ char.attrs[asp.attr] }}
          </template>
        </fwb-tooltip>
        <fwb-tooltip text-xl placement="bottom">
          <template #trigger>
            <div flex flex-col items-center justify-center>
              Нав:
            </div>
          </template>
          <template #content>
            Бонусы проверки Навыков
          </template>
        </fwb-tooltip>
        <fwb-tooltip text-lg placement="bottom" v-for="asp in $ASPECTS">
          <template #trigger>
            <div flex items-center justify-center :class="`text-${asp.id}-light`">
              <Icon :icon="asp.check_icon" mr-2 />
              {{ char.checks[asp.checks] }}
            </div>
          </template>
          <template #content>
            Бонус при проверке {{ $LANG[asp.checks] }} этого персонажа - {{ char.checks[asp.checks] }}
          </template>
        </fwb-tooltip>
      </attrs-block>

    </div>
    <classes-block med text-lg>
      <b>Классы персонажа:</b> <span v-for="cls in char.classes">{{ $CLASSES[cls].name[char.gender[0]] }}</span>
    </classes-block>
    <div det>
    <equips-table>
      <equip-block border-2 flex flex-col border-slate-700 class="bg-slate-700/50" rounded-md my-2 p-2>
        <fwb-input v-model="char.equips.current.name" label="Название набора" placeholder="Щит и меч" size="lg">
          
          <template #suffix>
            <fwb-button outline>Авто</fwb-button>
          </template>
        </fwb-input>
        <div flex justify-between gap-3>
          <fwb-select v-model="char.equips.current.left" :options="selectItems('current', 'left')" label="Левая рука" />
          <fwb-select v-model="char.equips.current.right" :options="selectItems('current', 'right')"
            label="Правая рука" />
        </div>
      </equip-block>
      <equip-block border-2 flex flex-col border-slate-700 class="bg-slate-700/50" rounded-md my-2 p-2>
        <fwb-input v-model="char.equips.secondary.name" label="Название набора" placeholder="Щит и меч" size="lg">
          <template #suffix>
            <fwb-button outline>Авто</fwb-button>
          </template>
        </fwb-input>
        <div flex justify-between gap-3>
          <fwb-select v-model="char.equips.secondary.left" :options="selectItems('secondary', 'left')"
            label="Левая рука" />
          <fwb-select v-model="char.equips.secondary.right" :options="selectItems('secondary', 'right')"
            label="Правая рука" />
        </div>
      </equip-block>
    </equips-table>
    <h2> Редактировать оружие </h2>
    <fwb-select v-model="weapon_edit" :options="selectAllItems()" label="Выберите оружие"/>
      <edit-item-block v-if="weapon_edit != null" mb-4>
        <template v-for="item in [char.items[weapon_edit]]"> 
          <fwb-input v-model="item.name" label="Название предмета" size="sm"></fwb-input>
          <item-stats-edit class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <fwb-input v-model="item.attack" label="Мод атаки" size="sm"/>
            <template v-if="typeof item.defence == 'object'">
              <template v-if="typeof item.defence.front == 'object'">
                <fwb-input v-model="item.defence.front.melee" label="Защита фронт удары" size="sm"/>
                <fwb-input v-model="item.defence.front.ranged" label="Защита фронт снаряды" size="sm"/>
              </template>
              <template v-if="typeof item.defence.side == 'object'">
                <fwb-input v-model="item.defence.side.melee" label="Защита фланг удары" size="sm"/>
                <fwb-input v-model="item.defence.side.ranged" label="Защита фланг снаряды" size="sm"/>
              </template>
            </template>
            <fwb-input v-else v-model="item.defence" label="Мод защиты" size="sm"/>
          </item-stats-edit>
          <template v-if="typeof item.damage == 'object'">
            <damage-block-edit class="grid grid-cols-[_1fr_6fr] gap-2 pt-4">
              <template v-for="(d, k) in item.damage">
                <!-- <fwb-input label="Стоимость" size="sm" disabled :value="k"/> -->
                <div flex items-end justify-center pb-1 text-3xl font-bold> {{k}} </div>
                <fwb-input v-model="char.items[weapon_edit].damage[k]" label="Урон" size="sm"/>
              </template>
            </damage-block-edit>
          </template>
  
        </template>
  
      </edit-item-block>
      <fwb-input v-model="char.name" label='Сменить имя персонажа'/>
    </div>

    <traits-block>
      <trait-block v-for="trait in char.computed.traits">
        <h3 font-bold>{{ trait.name }}</h3>
        <div>{{ trait.desc }}</div>
      </trait-block>
    </traits-block>

    <fwb-textarea v-model="char.notes" :rows="16" label="Заметки"
          placeholder="Любая дополнительная информация" />
    
    <fwb-button color="green" size="lg" @click="$router.push('/')" w-full mt-4>
      Вернуться на панель персонажей
    </fwb-button>


  </main>
  <fwb-modal class="modal" :class="check_success ? 'green' : 'red'" position="bottom-center" v-if="isShowModal"
    @close="closeModal" @click="closeModal">
    <template #header>
      <div class="title flex items-center text-5xl font-bold">{{ check_success ? 'Успех!' : 'Провал...' }}</div>
    </template>
    <template #body class="modalBody">
      <p v-if="check_success"> Вам удалось пройти проверку!</p>
      <p v-else> Проверка оказалась слишком сложной для Вас.</p>

    </template>
  </fwb-modal>
</template>

<style>
div.modal div.max-w-2xl.relative.p-4.w-full.h-full div.relative.bg-white.rounded-lg {
  @apply absolute left-2 right-2 bottom-4 bg-slate-800;
}

div.modal div.max-w-2xl.relative.p-4.w-full.h-full div.relative.bg-white.rounded-lg>div:nth-child(2) {
  @apply max-h-[80vh] overflow-y-auto;
}

div.modal.green .title {
  @apply text-green-400;
}

div.modal.red .title {
  @apply text-red-600;
}

div.v-popper--theme-tooltip-dark div.v-popper__wrapper div.v-popper__inner {
  @apply bg-slate-900;
}

html div.v-popper--theme-tooltip-dark div.v-popper__wrapper {
  @apply ml-2 mr-2;
}

div.v-popper__arrow-container {
  @apply hidden;
}

button.spec-flex-button span {
  @apply flex justify-around;
}

defence-table {
  @apply rounded-lg overflow-hidden bg-slate-900/20 my-2 border-2 border-slate-700;
}

defence-table def-corner {
  @apply font-bold;
}

defence-table>* {
  @apply m-1 flex justify-center items-center;
}

defence-table>def-row-head {
  @apply justify-start m-0 pl-2 bg-slate-700/40;
}

defence-table>def-header {
  @apply m-0 bg-slate-700/40;
}
</style>
