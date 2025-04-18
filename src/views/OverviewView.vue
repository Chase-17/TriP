<script setup>
import $DIFFS from '../data/diffs.js'
import $ITEMS from '../data/items.js'
import $CLASSES from '../data/classes.js'
import $ASPECTS from '../data/aspects.js'
import $ITEM_TYPES from '../data/item_types.js'
</script>

<script>
export default {
  data: () => ({
    isShowModal: false,
    attackResult: {
    },
    healthConv: {
      14: [3, 4, 1, 1],
      12: [3, 3, 1, 1],
      10: [3, 2, 1, 1],
      8:  [3, 3, 0, 1],
      6:  [2, 3, 0, 1],
      4:  [2, 2, 0, 1],
      2:  [1, 1, 0, 1],
    }
  }),
  methods: {
    deleteChar(key) {
      let corpses = localStorage.getItem("CORPSES");
      if (corpses == 'undefined') {
        corpses = [];
      } else {
        corpses = JSON.parse(corpses);
        if (corpses == null)
          corpses = [];
      }
      corpses.push(JSON.parse(JSON.stringify(this.$CHARS.value[key])));
      localStorage.setItem("CORPSES", JSON.stringify(corpses));
      delete this.$CHARS.value[key];
    },
    reviveChar(char) {
      char.alive = true;
      char.health_block.scratch.cur = 0;
      char.health_block.light.cur = 0;
      char.health_block.heavy.cur = 0;
      char.health_block.fatal.cur = 0;
      this.computeChar(char.name)
    },
    wound(char, type) {
      if (char.health_block[type].cur + 1 <= char.health_block[type].max)
        char.health_block[type].cur++;
      else {
        if (type == 'scratch') {
          char.health_block.scratch.cur = 0;
          this.wound(char, 'light');
        }
        if (type == 'light')
          this.wound(char, 'heavy');
        if (type == 'heavy')
          this.wound(char, 'fatal');
        if (type == 'fatal')
          char.alive = false;
      }
      this.computeChar(char.name)
    },
    openChar(key) {
      this.$router.push(`/character-page/${key}`);
    },
    closeModal() {
      this.isShowModal = false;
      this.attackResult = {};
    },
    endCharTurn(char) {
      char.cur_bursts = char.max_bursts;
    },
    takeBurst(char) {
      if (char.cur_bursts > 0) char.cur_bursts--;
    },
    catItemAltEquip(char) {
      let result = [];
      let left = char.items[char.equips.secondary.left];
      if (typeof left !== 'undefined')
        result.push($ITEM_TYPES[left.subcat].icon);
      let right = char.items[char.equips.secondary.right];
      if (typeof right !== 'undefined')
        result.push($ITEM_TYPES[right.subcat].icon);
      return result;
    },
    async attackRoll(bonus, char, bursts = 0) {
      let expr = `1d12+${bursts}d6`;
      if (bursts > 0) char.cur_bursts -= bursts;
      if (char.cur_bursts < 0) char.cur_bursts = 0;
      let test = this.$initiateRoll({expr:expr}).then((res) => {
        let result = res.total + bonus;
        this.attackResult.left = null
        this.attackResult.right = null
        if (result > -1) {
          this.attackResult.success = true;
          let left = char.items[char.equips.current.left];
          let right = char.items[char.equips.current.right];
          if (typeof left != 'undefined') {
            this.attackResult.left = { name: left.name, attackVariants: {} };
            if (typeof left.damage == 'object')
              Object.entries(left.damage).forEach(([score, name]) => {
                if (score <= result)
                  this.attackResult.left.attackVariants[score] = name;
              });
          }

          if (typeof right != 'undefined') {
            this.attackResult.right = { name: right.name, attackVariants: {} };
            if (typeof right.damage == 'object')
              Object.entries(right.damage).forEach(([score, name]) => {
                if (score <= result)
                  this.attackResult.right.attackVariants[score] = name;
              });
          }
        } else {
          this.attackResult.success = false;
        }
        this.attackResult.roll = res.total;
        this.attackResult.bonus = bonus;
        this.attackResult.total = result;

        this.isShowModal = true;
      });
    },
    currentEquipName(char) {
      let result = "";
      let left = char.items[char.equips.current.left];
      if (typeof left !== 'undefined')
        result += left.name;
      let right = char.items[char.equips.current.right];
      if (typeof right !== 'undefined')
        result += ` и ${right.name}`;
      return result;
    },
    iconByItemKey(key) {
      return $ITEM_TYPES[$ITEMS[key].subcat].icon;
    },
    getImageHeldStyles(char, hand) {
      let index = (hand == 'left' ? 0 : 1);
      let def_left = (hand == 'left' ? 65 : 85);
      let def_right = (hand == 'left' ? 30 : 10);
      let def_top = 65;
      let def_bottom = 0;
      if (typeof char.equips.current[hand] == 'undefined') return "";
      if (typeof char.items[char.equips.current[hand]] == 'undefined') return "";
      let item_key = char.items[char.equips.current[hand]].key;
      if (typeof $ITEMS[item_key] == 'undefined') return "";
      let meta = $ITEMS[item_key].img_meta ?? {};
      let bg_size = meta.bg_size ?? '100%';
      let left = (def_left + (meta.left ?? 0)) + "px";
      let right = (def_right + (meta.right ?? 0)) + "px";
      let top = (def_top + (meta.top ?? 0)) + "px";
      let bottom = (def_bottom + (meta.bottom ?? 0)) + "px";
      let bg_pos = meta.bg_pos ?? "50% 0%";
      let result = `background-image: url('img/items/${item_key}.png');
      background-size: ${bg_size};
      background-repeat: no-repeat;
      left: ${left};
      right: ${right};
      top: ${top};
      bottom: ${bottom};
      background-position: ${bg_pos};
      `;
      return result;
    },
    checkDiff(val) {
      let rounded = (Math.floor(val / 3) * 3);
      if (typeof $DIFFS[rounded] == undefined)
        return $DIFFS[36];
      else return $DIFFS[rounded];
    },
    conicBGbyAspects(aspects) {
      let result = "";
      for (let i = 0; i < 12; i++)
        result += `var(--color-${aspects[i % aspects.length]}-DEFAULT) ${Math.round(100 / 12 * i)}%, `;
      result += `var(--color-${aspects[0]}-DEFAULT) 100%`;
      return result;
    },
    computeChars() {
      Object.entries(this.$CHARS.value).forEach(([key, value]) => {
        // this.$CHARS.value[key] = computeChar(key);
        this.computeChar(key);
      })
    },
    computeChar(key) {
      let obj = JSON.parse(JSON.stringify(this.$CHARS.value[key]));
      if (typeof obj.level == 'undefined') obj.level = 1;
      let def = obj.checks.defence;
      def += obj.armor_equipped.defence;
      let moves = obj.max_moves + obj.armor_equipped.movement;
      let bursts = obj.max_bursts + obj.armor_equipped.bursts;
      let armor = obj.base_armor + obj.armor_equipped.resist;
      if (typeof obj.equips.current.name == 'undefined')
        obj.equips.current = {name: '', left: null, right: null};
      if (typeof obj.equips.secondary.name == 'undefined')
        obj.equips.secondary = {name: '', left: null, right: null};
      let left_hand = obj.equips.current.left;
      let right_hand = obj.equips.current.right;
      if (left_hand !== null) left_hand = obj.items[left_hand];
      else left_hand = null;
      if (right_hand !== null) right_hand = obj.items[right_hand];
      else right_hand = null;
      let equip_data = this.computeEquips(left_hand, right_hand);
      if (typeof obj.health_block == 'undefined') {
        let health = this.healthConv[obj.max_hp];
        let health_block = {
          scratch: {max: health[0], cur: 0},
          light: {max: health[1], cur: 0},
          heavy: {max: health[2], cur: 0},
          fatal: {max: health[3], cur: 0}
        };
        obj.health_block = health_block;
      }
      if (typeof obj.alive == 'undefined') {
        obj.alive = true;
      }
      if (typeof obj.notes == 'undefined') {
        obj.notes = "";
      }
      let penalty = 0;
      penalty += obj.health_block.light.cur * 3;
      penalty += obj.health_block.heavy.cur * 6;

      let defence = {
        front: {
          melee: Math.max(0, def + equip_data.defence.front.melee - penalty),
          ranged: Math.max(0, def + equip_data.defence.front.ranged - penalty),
        },
        side: {
          melee: Math.max(0, def + equip_data.defence.side.melee / 2 - penalty),
          ranged: Math.max(0, def + equip_data.defence.side.ranged / 2 - penalty),
        },
        back: {
          melee: Math.max(0, def - penalty),
          ranged: Math.max(0, def / 2 - penalty),
        }
      };
      let def_cats = {
        front: {
          melee: this.checkDiff(defence.front.melee),
          ranged: this.checkDiff(defence.front.ranged),
        },
        side: {
          melee: this.checkDiff(defence.side.melee),
          ranged: this.checkDiff(defence.side.ranged),
        },
        back: {
          melee: this.checkDiff(defence.back.melee),
          ranged: this.checkDiff(defence.back.ranged),
        },
      };
      let traits = [];
      console.log(obj.traits);
      Object.entries(obj.traits).forEach(([index, level]) => {
        // console.log(index);
        let arr = index.split("_");
        let tr = {};
        if (arr[0] == 'class')
          tr = $CLASSES[arr[1]].traits[arr[2]];
        if (arr[0] == 'aspect')
          tr = $ASPECTS[arr[1]].traits[arr[2]];
        traits.push({name: tr.name + " ("+level+")", desc: tr.levels[level]})
      });
      let computed = {
        moves: moves,
        bursts: bursts,
        attack: equip_data.attack + obj.checks.attack - penalty,
        defence: defence,
        defence_cats: def_cats,
        resist: armor,
        traits: traits,
      }
      obj.computed = computed;
      this.$CHARS.value[key] = obj;
    },
    computeEquips(i1, i2) {
      if (i1 === null || typeof i1 === 'undefined') i1 = {
        attack: 0,
        defence: 0,
      }
      if (i2 === null || typeof i2 === 'undefined') i2 = {
        attack: 0,
        defence: 0,
      }
      // console.log(i2);
      let attack;
      if (i1.attack > 0 && i2.attack > 0)
        attack = Math.max(i1.attack, i2.attack)
      else
        attack = i1.attack + i2.attack;

      if (typeof i1.defence !== 'object')
        i1.defence = { front: { melee: i1.defence, ranged: 0 }, side: { melee: 0, ranged: 0 } };
      if (typeof i2.defence !== 'object')
        i2.defence = { front: { melee: i2.defence, ranged: 0 }, side: { melee: 0, ranged: 0 } };
      if (typeof i1.defence.side == 'undefined')
        i1.defence.side = { melee: 0, ranged: 0 };
      if (typeof i2.defence.side == 'undefined')
        i2.defence.side = { melee: 0, ranged: 0 };
      let defence = {
        front: {
          melee: Math.max(i1.defence.front.melee, i2.defence.front.melee),
          ranged: Math.max(i1.defence.front.ranged, i2.defence.front.ranged),
        },
        side: {
          melee: Math.max(i1.defence.side.melee, i2.defence.side.melee),
          ranged: Math.max(i1.defence.side.ranged, i2.defence.side.ranged),
        }
      }
      return { attack: attack, defence: defence };
    },
    switchWeapon(key) {
      let temp = JSON.parse(JSON.stringify(this.$CHARS.value[key].equips.secondary))
      this.$CHARS.value[key].equips.secondary = JSON.parse(JSON.stringify(this.$CHARS.value[key].equips.current))
      this.$CHARS.value[key].equips.current = JSON.parse(JSON.stringify(temp))
      this.computeChar(key);

    },
    hpChange(key, value) {
      this.$CHARS.value[key].current_hp += value;
      if (this.$CHARS.value[key].current_hp < 0) this.$CHARS.value[key].current_hp = 0;
      if (this.$CHARS.value[key].current_hp > this.$CHARS.value[key].max_hp)
        this.$CHARS.value[key].current_hp = this.$CHARS.value[key].max_hp;
    },
  },
  computed: {
    attackResultColor() {
      if (typeof this.attackResult.success == 'undefined') return '';
      if (this.attackResult.success) return 'green';
      else return 'red';
    }
  },
  mounted() {
    this.computeChars();
  },
}

</script>

<template>
  <main>
    <div v-if="$CHARS != null && Object.keys($CHARS._value).length < 1" relative>
      <div>
        <h1>Добро пожаловать в ролевую систему TriP!</h1>
        <p>
          Где Вы можете стать кем угодно: отважными героями, тёмными культистами, исследователями
          далёких земель, владельцами торговой империи или собственного государства.
        </p>
        <img :src="'img/trip_illust.png'" w-full rounded-md my-2 />
        <h2 med>Что за Система?</h2>
        <p med>
          <b>Первое отличие</b> от привычных НРИ - если в других системах "мультикласс" это скорее
          исключение, то в TriP - правило.
        </p>
        <p med>
          В настоящий момент в игре <b>39 классов, 21</b> из которых доступны со старта. В процессе
          своего развития Ваш персонаж будет обретать новые "профессии", новые умения, новые
          особенности.
          <img :src="'img/class_diagram.svg'" w-full rounded-md my-2 />
        </p>
        <p med>
          <b>Второе большое отличие</b> - три основных направления деятельности для игроков, под
          каждое из которых есть свой модуль правил. Это бой, исследование и развитие.
        </p>
        <p med>
          При желании игроки могут сфокусироваться на чём-то одном, а могут смешивать составляющие в
          любых пропорциях.
        </p>
        <p det>
          Кому-то будет интересно играть исключительно в экономическую стратегию, кому-то в военную.
          Кто-то решит потратить богатства, найденные в логове монстра на покупку своего участка
          земли - или на найм крепкой наёмничьей группы. Строить и развивать в TriP так же
          интересно, как воевать и исследовать, а проработанные правила не позволят Вам заскучать в
          живом и меняющемся мире.
        </p>
        <p med>
          Наконец, <b>третье важное отличие</b> - модульность. Базовые правила очень просты, Вы
          потратите около 10 минут на то, чтобы изучить их и создать своего первого персонажа. Даже
          если раньше никогда не играли в НРИ.
        </p>
        <p med>
          Но для тех, кто хочет конкретики и глубины, подготовлены дополнительные модули - боевой,
          экономический, исследовательский и так далее. Все их можно подключать (и отключать)прямо
          во время игры, например когда Вы впервые столкнулись с подходящей ситуацией.
        </p>
        <p det>
          Конечно, на этом отличия не заканчиваются. Вместо множества бросков кубиков и арифметики,
          TriP использует систему, по которой вычислений либо и вовсе нет, либо с ними может
          справиться первоклассник с помощью пальцев одной руки. При этом реализм и тактическая
          гибкость остаются на высоте!
        </p>
        <p det>
          Большой приоритет при создании TriP был в том, чтобы не перегружать игроков выбором,
          сохраняя возможность для творчества. Во многих ролевых системах при повышении уровня Вы
          либо выбираете из десятков вариантов (например, новое заклинание), либо не выбираете
          вовсе.
        </p>
        <p det>
          TriP стремится сделать так, чтобы выбор был всегда, но не слишком перегружающий разум
          игрока.
        </p>
        <p>Сейчас Вы пройдёте через все шаги, необходимые для создания персонажа:</p>
      </div>
      <button-block justify-center fixed bottom-0 left-0 right-0 bg-slate-800>
        <fwb-button color="yellow" outline square @click="$router.push('new-character')">
          <template #prefix>
            <Icon icon="mdi:arrow-right" text-xl />
          </template>
          Cоздать персонажа
        </fwb-button>
      </button-block>
    </div>
    <div v-else>
      <h1>Ваши персонажи:</h1>
      <characters-block class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <character-block v-for="(char, key) in $CHARS.value" flex my-4 :class="!char.alive?'dead':''">
          <template v-if="char.computed ?? false">
            
            <portrait-block class="w-[120px] min-h-[130px] bg-slate-900 rounded-l-full" relative @click=""
              overflow-hidden>
              <template v-if='(typeof char.computed != "undefined")'>
                <svg height="130px" width="65px" viewBox="0 0 500 1000" absolute class="-translate-y-1/2 top-1/2 z-30">

                  <path d="M500,5 A495,495 1,0,0 71,253" stroke-width="10"
                    :stroke="char.computed.defence_cats.front.ranged.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.front.ranged.linetype == 'dashed' ? '40 20' : '10000'" />
                  <path v-if="char.computed.defence_cats.front.ranged.linetype == 'double'"
                    d="M500,30 A470,470 1,0,0 93,265" stroke-width="10"
                    :stroke="char.computed.defence_cats.front.ranged.linecolor" fill="transparent" />
                  <!----front ranged---->
                  <path d="M71,253 A495,495 1,0,0 71,748" stroke-width="10"
                    :stroke="char.computed.defence_cats.side.ranged.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.side.ranged.linetype == 'dashed' ? '40 20' : '10000'" />
                  <path v-if="char.computed.defence_cats.side.ranged.linetype == 'double'"
                    d="M93,265 A470,470 1,0,0 93,735" stroke-width="10"
                    :stroke="char.computed.defence_cats.side.ranged.linecolor" fill="transparent" />
                  <!----flank ranged---->
                  <path d="M71,748 A495,495 1,0,0 500,990" stroke-width="10"
                    :stroke="char.computed.defence_cats.back.ranged.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.back.ranged.linetype == 'dashed' ? '40 20' : '10000'" />
                  <path v-if="char.computed.defence_cats.back.ranged.linetype == 'double'"
                    d="M93,735 A470,470 1,0,0 500,970" stroke-width="10"
                    :stroke="char.computed.defence_cats.back.ranged.linecolor" fill="transparent"
                    stroke-dasharray="5000" />
                  <!----back ranged---->
                  <path v-if="char.computed.defence_cats.front.melee.linetype == 'double'" d="M115,278 L500,55"
                    :stroke="char.computed.defence_cats.front.melee.linecolor" stroke-width="10" />
                  <path d="M136,290 L500,80" stroke-width="10"
                    :stroke="char.computed.defence_cats.front.melee.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.front.melee.linetype == 'dashed' ? '40 20' : '10000'" />
                  <!----front melee---->
                  <path v-if="char.computed.defence_cats.side.melee.linetype == 'double'" d="M115,278 L115,722"
                    stroke-width="10" :stroke="char.computed.defence_cats.side.melee.linecolor" />
                  <path d="M136,290 L136,710" stroke-width="10"
                    :stroke="char.computed.defence_cats.side.melee.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.side.melee.linetype == 'dashed' ? '40 20' : '10000'" />
                  <!----flank melee---->
                  <path v-if="char.computed.defence_cats.back.melee.linetype == 'double'" d="M115,722 L500,945"
                    stroke-width="10" :stroke="char.computed.defence_cats.back.melee.linecolor" />
                  <path d="M136,710 L500,920" stroke-width="10"
                    :stroke="char.computed.defence_cats.back.melee.linecolor" fill="transparent"
                    :stroke-dasharray="char.computed.defence_cats.back.melee.linetype == 'dashed' ? '40 20' : '10000'" />
                  <!----back melee---->
                </svg>
              </template>
              <div absolute class="w-[100px] h-[100px] top-1/2 left-[65px] -translate-x-1/2 -translate-y-1/2 hexagon">
                <div w-full h-full absolute z-10
                  :style="'background: url(\'img/portraits/' + char.picture + '\'); background-position: bottom center; background-size: 90%; background-repeat: no-repeat;'">
                </div>
                <div absolute bg-red-300
                  class="w-full h-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" :class="char.alive? 'rotating-animation': ''"
                  :style="'background-image: conic-gradient(' + conicBGbyAspects(char.aspects) + ');'"> </div>
              </div>

              <!-- <img :src="'img/portraits/'+char.picture" aspect-square class="w-[120px] h-[120px] hexagon absolute top-1/2 left-[75px] -translate-x-1/2 -translate-y-1/2"> -->
              <!-- <Icon :icon="iconByItemKey(char.items_taken[0])" text-3xl text-white absolute bottom-0 class="left-1/2"/>
            <Icon v-if="char.items_taken[1]" :icon="iconByItemKey(char.items_taken[1])" text-3xl text-white absolute bottom-0 class="left-[67%]"/> -->
              <hand-item class="block absolute filter-outline" :style="getImageHeldStyles(char, 'left')">

              </hand-item>
              <hand-item class="block absolute filter-outline" :style="getImageHeldStyles(char, 'right')">

              </hand-item>


            </portrait-block>
            <char-data-block flex flex-grow flex-col bg-slate-900 rounded-r-lg p-2 pl-0 class="ml-[-8px]" relative>
              <div flex justify-between class="pt-0 ml-[-30px] mt-[-7px]">
                <h1 text-2xl font-bold text-white class='uppercase pt-0'>{{ char.name }}</h1>
                <bursts-block flex items-center>
                  <template v-if="char.cur_bursts > 0">
                    <Icon class="text-yellow-400" text-2xl icon="game-icons:fire-dash" v-for="n in char.cur_bursts"
                      @click="takeBurst(char)" />
                  </template>
                  <Icon v-else class="text-blue-400" text-2xl icon="vaadin:time-forward" @click="endCharTurn(char)" />
                </bursts-block>
              </div>
              <template v-if="char.alive">
              <health-block absolute class="top-1/2 -translate-y-1/2 left-0 right-1/4 h-[50px] p-0">
                <!-- <simple-hp grid grid-cols-6 justify-center class="h-full">
                  <hp-point class="h-[20px] w-[20px]" v-for="n in char.max_hp" :class="{filled: n <= char.current_hp, small: char.max_hp > 10}"> </hp-point>
                </simple-hp> -->
                <complex-hp flex class="gap-1 h-full">
                  <hp-scratch flex flex-col justify-end flex-grow justify-between class="basis-[10%]" @click="wound(char, 'scratch')">
                    <hp-bar v-for="index in char.health_block.scratch.max" :class="index <= char.health_block.scratch.cur ? 'wounded': ''"></hp-bar>
                  </hp-scratch>
                  <hp-light flex flex-col justify-end flex-grow class="basis-[20%]" @click="wound(char, 'light')">
                    <hp-bar v-for="index in char.health_block.light.max" :class="index <= char.health_block.light.cur ? 'wounded': ''"></hp-bar>
                  </hp-light>
                  <hp-heavy flex flex-col justify-end flex-grow class="basis-[30%]"  @click="wound(char, 'heavy')">
                    <hp-bar v-for="index in char.health_block.heavy.max" :class="index <= char.health_block.heavy.cur ? 'wounded': ''"></hp-bar>
                  </hp-heavy>
                  <hp-fatal flex flex-col justify-end flex-grow class="basis-[40%]" @click="wound(char, 'fatal')">
                    <hp-bar v-for="index in char.health_block.fatal.max" :class="index <= char.health_block.fatal.cur ? 'wounded': ''"></hp-bar>
                  </hp-fatal>
                </complex-hp>
              </health-block>
              <control-block absolute grid grid-cols-2
                class="top-1/2 -translate-y-1/2 left-3/4 right-0 h-[50px] place-content-center place-items-center">

                <Icon icon="game-icons:wolverine-claws" text-3xl text-red-600 />
                <Icon icon="majesticons:open-line" text-3xl text-green-600 @click="openChar(key)" />
              </control-block>
              <wrapper-wrapper absolute bottom-0 left-0 overflow-x-auto overflow-y-hidden
                class="no-scrollbar right-[60px]">
                <attack-wrapper block>
                  <attack-block flex flex-row no-wrap>
                    <equip-name flex-grow class="text-nowrap text-xs flex flex-nowrap items-center">
                      <swap-weapon flex @click='switchWeapon(key)'>
                        <Icon v-for="icon in catItemAltEquip(char)" :icon="icon" text-sm />
                      </swap-weapon>
                      {{ char.equips.current.name }}
                    </equip-name>
                    <fwb-tooltip v-for="(check, diff) in $DIFFS" :class="check.class" placement="bottom">
                      <template #trigger>
                        <attack-count
                          :style="[check.linetype == 'dashed' ? 'border-style: dashed; border-top-width: 1px; margin-top: 2px; ' : (check.linetype == 'double' ? 'border-style: double; border-top-width: 3px' : 'border-style: solid; border-top-width: 1px; margin-top: 2px;'), 'border-color: ' + check.linecolor]"
                          class="basis-0 flex-grow flex min-w-[50px] ml-0.5 place-content-center place-items-center">
                          <tip det class="font-size-[0.6em]" mr-1>{{ check.short }}: </tip>
                          <attack-value>
                            <!-- <tip med class="text-[0.6rem]">{{check.name}}</tip> -->
                            {{ char.computed.attack - diff }}
                          </attack-value>
                        </attack-count>
                      </template>
                      <template #content>
                        Атака по защите <span :class="check.class">{{ check.name }} </span> набором {{
                        currentEquipName(char) }},
                        модификатор атаки: {{ char.computed.attack - diff }}
                        <fwb-button block w-full my-2 color='red' class="spec-flex-button">
                          <div @click="attackRoll((char.computed.attack - diff), char, 0)">Атаковать!</div>
                          <Icon class="text-yellow-400" text-2xl icon="game-icons:fire-dash"
                            v-for="n, i in char.cur_bursts" @click="attackRoll((char.computed.attack - diff), char, (i+1))"/>
                        </fwb-button>
                      </template>
                    </fwb-tooltip>
                  </attack-block>
                </attack-wrapper>
              </wrapper-wrapper>
              <armor-movement-block absolute bottom-0 class="right-[0px]" pr-1 pb-1 flex>
                <block-wrapper relative block class='h-[25px] w-[25px]'>
                  <Icon icon="game-icons:shoulder-armor" text-2xl text-blue-600
                    class="left-1/2 -translate-x-1/2 absolute top-1/2 -translate-y-1/2" />
                  <span class="font-size-[12px] left-1/2 -translate-x-1/2 absolute top-1/2 -translate-y-1/2" text-white>
                    {{ char.computed.resist }}
                  </span>
                </block-wrapper>
                <block-wrapper relative block class='h-[25px] w-[25px]'>
                  <Icon absolute icon="mdi:arrow-right-bold-hexagon-outline" text-blue-600
                    class="text-2xl left-1/2 -translate-x-1/2 absolute top-1/2 -translate-y-1/2" />
                  <span class="font-size-[12px] left-1/2 -translate-x-1/2 absolute top-1/2 -translate-y-1/2" text-white>
                    {{ char.computed.moves }}
                  </span>
                </block-wrapper>
              </armor-movement-block>
            </template>
            <template v-else>
              <death-screen mx-3 flex flex-col>
                <death-message font-bold text-4xl uppercase>
                  Помер
                </death-message>
                <button-block>
                  <fwb-button color="red" outline size="sm" class="text-xs opacity-50 hover:opacity-100" @click="deleteChar(key)"> 
                    Выбросить труп
                  </fwb-button>
                  <fwb-button color="yellow" outline size="sm" class="text-xs opacity-5 hover:opacity-100" @click="reviveChar(char)"> 
                    Воскресить
                  </fwb-button>
                </button-block>
              </death-screen>
            </template>
              <!-- <control-block mt-2 flex gap-1 items-center justify-between>
            <Icon icon="game-icons:switch-weapon" text-3xl text-white @click='switchWeapon(key)'/>
            <Icon icon="game-icons:wolverine-claws" text-3xl text-red-600 @click='hpChange(key, -9)'/>
            <Icon icon="game-icons:bloody-stash" text-2xl text-red-500 @click='hpChange(key, -3)'/>
            <Icon icon="game-icons:serrated-slash" text-2xl text-red-400 @click='hpChange(key, -1)'/>
            <Icon icon="game-icons:round-potion" text-3xl text-green-300 @click='hpChange(key, 3)'/>
            <Icon icon="game-icons:upgrade" text-3xl text-yellow-400 @click="openChar(key)"/>
          </control-block> -->
              <!-- <div flex justify-between class="ml-[-75px] pt-0 mt-[-8px]"> 
                  <h1 text-xl font-bold text-white class='uppercase pt-0'>Здоров</h1>
                  <bursts-block flex items-center>
                    <Icon class="text-yellow-400" text-3xl icon="game-icons:fire-dash" v-for="n in char.cur_bursts"/>
                  </bursts-block>
                </div> -->
            </char-data-block>
        </template>
        </character-block>
      </characters-block>
    </div>
  </main>
  <fwb-modal class="modal" :class="attackResultColor" position="bottom-center" v-if="isShowModal" @close="closeModal"
    @click="closeModal">
    <template #header>
      <div class="title flex items-center text-5xl font-bold">{{ attackResult.success ? 'Успех!' : 'Промах...' }}</div>
    </template>
    <template #body class="modalBody">
      <div flex justify-between>
        <div flex flex-col items-center>
          <tip>Бросок</tip>
          <div flex items-center text-4xl>
            <Icon icon="game-icons:rolling-dices" />
            <hand-item-stat-value>
              {{ attackResult.roll }}
            </hand-item-stat-value>
          </div>
        </div>
        <div flex flex-col items-center>
          <tip>Мод</tip>
          <div flex items-center text-4xl>
            <Icon icon="game-icons:cracked-shield" />
            <hand-item-stat-value>
              {{ attackResult.bonus }}
            </hand-item-stat-value>
          </div>
        </div>
        <div flex flex-col items-center>
          <tip>Результат</tip>
          <div flex items-center text-4xl>
            <Icon icon="game-icons:skull-crack" />
            <hand-item-stat-value>
              {{ attackResult.total }}
            </hand-item-stat-value>
          </div>
        </div>
      </div>
      <p v-if="attackResult.success"> Вы успешно преодолели защиту врага и можете нанести ему урон:</p>
      <p v-else> Защита противника оказалась слишком крепкой, Вам не удалось через неё пробиться.</p>
      <template v-if="attackResult.left !== null">
        <h1>
          {{ attackResult.left.name }}
        </h1>
        <fwb-table striped class="overflow-hidden rounded-lg mt-2 border border-slate-700">
          <fwb-table-head class="">
            <fwb-table-head-cell width="20%" class="bg-slate-800/30">Превышение защиты</fwb-table-head-cell>
            <fwb-table-head-cell width="80%" class="bg-slate-800/30 text-right">Эффект</fwb-table-head-cell>
          </fwb-table-head>
          <fwb-table-body>
            <fwb-table-row v-for="(text, score) in attackResult.left.attackVariants"
              class="dark:even:bg-slate-700/50 dark:odd:bg-slate-700/20">
              <fwb-table-cell class="py-2">{{ score }}</fwb-table-cell>
              <fwb-table-cell class="py-2">{{ text }}</fwb-table-cell>
            </fwb-table-row>
          </fwb-table-body>
        </fwb-table>
      </template>
      <template v-if="attackResult.right !== null">
        <h1>
          {{ attackResult.right.name }}
        </h1>
        <fwb-table striped class="overflow-hidden rounded-lg mt-2 border border-slate-700">
          <fwb-table-head class="">
            <fwb-table-head-cell width="20%" class="bg-slate-800/30">Превышение защиты</fwb-table-head-cell>
            <fwb-table-head-cell width="80%" class="bg-slate-800/30 text-right">Эффект</fwb-table-head-cell>
          </fwb-table-head>
          <fwb-table-body>
            <fwb-table-row v-for="(text, score) in attackResult.right.attackVariants"
              class="dark:even:bg-slate-700/50 dark:odd:bg-slate-700/20">
              <fwb-table-cell class="py-2">{{ score }}</fwb-table-cell>
              <fwb-table-cell class="py-2">{{ text }}</fwb-table-cell>
            </fwb-table-row>
          </fwb-table-body>
        </fwb-table>
      </template>
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
character-block.dead portrait-block svg {
  display:none;
}
character-block.dead portrait-block div {
  @apply grayscale blur-[2px];
}
character-block.dead portrait-block hand-item{
  @apply grayscale;
}
character-block.dead char-data-block h1 {
  @apply blur-[2px];
}
character-block.dead bursts-block{
  display:none;
}
</style>
