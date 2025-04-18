<script>
export default {
  data: () => ({
    search_text: '',

  }),
  methods: {
    openSpoiler(event) {
      if (event.target.classList.contains('block-open'))
        event.target.classList.remove('block-open');
      else
        event.target.classList.add('block-open');
    }
  }
}
</script>

<template>
  <div class="about flex flex-col">
    <h1>TriP cheatsheet</h1>
    <p> На странице-шпаргалке Вы можете найти все правила игры, можете читать их по порядку или находить нужное с
      помощью поиска: </p>
    <fwb-input v-model="search_text" placeholder="Правила, заклинания, навыки" rounded-md class="my-2" />
    <fwb-accordion always-open>
      <fwb-accordion-panel>
        <fwb-accordion-header class="rounded-md-child">Быстрый старт</fwb-accordion-header>
        <fwb-accordion-content class="less-p-child">
          <div>
            <p> В TriP не получится играть в одиночку, нужен как минимум один ведущий и один игрок, хотя рекомендуется
              собрать компанию из 4-6 игроков. Ведущий, он же "мастер" должен лучше других разбираться в правилах, иметь
              какие-то задумки по поводу мира и истории, которую хотелось бы рассказать. </p>
            <p> Игроки создают персонажей, которые уместны для оговоренного мира и сеттинга, прорабатывают их характер и
              мотивации в меру своих возможностей, затем начинается игра. </p>
            <p> Сам игровой цикл чертовски прост:</p>
            <ul>
              <li> Мастер описывает ситуацию, в которую попали персонажи игроков </li>
              <li> Игроки делают "заявки", что их персонажи хотели бы сделать в этой ситуации. </li>
              <li> Мастер описывает результат их действий, при необходимости требуя игрока пройти те или иные Проверки
              </li>
              <li> Игроки решают что делать в изменившейся ситуации, запуская, таким образом, новый виток цикла </li>
            </ul>
            <p>Мастер назначает Проверку, если попытка персонажа имеет шансы как увенчаться успехом, так и провалиться.
              Для этого он говорит, какую проверку и какой сложности нужно пройти (Конфликт, Порядок, Влияние,
              Коварство, Диверсия или Поиск). Игрок бросает кубик d12 и сравнивает выпавшее значение с числом в своём
              листе персонажа.
            </p>
            <p>Если выпало меньше - попытка провалилась, иначе - персонаж преуспел.</p>
            <p></p>
            <h3 font-bold>Это всё, что Вам нужно знать, чтобы начать играть. </h3>
            <p>Все остальные правила, касающиеся более сложных механик (боя, исследования, репутации, денег и богатства,
              развития персонажей и организаций, магии, колдовства, заклинаний, боевых приёмов и прочего) являются
              опциональными, их можно добавлять в игру или не добавлять.</p>
            <p></p>
            <p>В такой, самой базовой вариации игра получается совершенно нарративной и почти не скованной правилами -
              то есть полностью зависящей от фантазии игроков и мастера. </p>
            <p></p>
            <p>Рекомендуется, всё же, подключать хотя бы три базовых модуля, касающиеся основных осей игры - боевой,
              развития и поиска. Правила хоть и сковывают полёт фантазии, придают происходящему больше веса и
              реалистичности, позволяют больше верить в происходящее в мире.</p>
            <p></p>
            <p>Но если Вам нравится играть без них - это замечательно, и это тоже правильный способ играть в TriP.</p>
            <p></p>
            <p>Помните главное правило системы - игроки собираются чтобы создать захватывающую историю и получить
              приятный опыт.
            </p>
          </div>
        </fwb-accordion-content>
      </fwb-accordion-panel>
      <fwb-accordion-panel>
        <fwb-accordion-header>another header</fwb-accordion-header>
        <fwb-accordion-content>
          <div>
            <p class="mb-2 text-gray-500 dark:text-gray-400">
              Flowbite is first conceptualized and designed using the Figma software so everything you see in the
              library has a design equivalent in our Figma file.
            </p>
            <p class="text-gray-500 dark:text-gray-400">
              Check out the <a href="https://flowbite.com/figma/"
                class="text-blue-600 dark:text-blue-500 hover:underline">Figma design system</a> based on the utility
              classes from Tailwind CSS and components from Flowbite.
            </p>
          </div>
        </fwb-accordion-content>
      </fwb-accordion-panel>
      <fwb-accordion-panel>
        <fwb-accordion-header>and one more header</fwb-accordion-header>
        <fwb-accordion-content>
          <div>
            <p class="mb-2 text-gray-500 dark:text-gray-400">
              Flowbite is first conceptualized and designed using the Figma software so everything you see in the
              library has a design equivalent in our Figma file.
            </p>
            <p class="text-gray-500 dark:text-gray-400">
              Check out the <a href="https://flowbite.com/figma/"
                class="text-blue-600 dark:text-blue-500 hover:underline">Figma design system</a> based on the utility
              classes from Tailwind CSS and components from Flowbite.
            </p>
          </div>
        </fwb-accordion-content>
      </fwb-accordion-panel>
    </fwb-accordion>
    <h2 my-0 py-0> Быстрый старт: </h2>

    <faq-block> <faq-header @click="openSpoiler"> Как играть?</faq-header>
      <faq-content>

      </faq-content>
    </faq-block>
    <faq-block> <faq-header @click="openSpoiler"> Лист персонажа </faq-header>
      <faq-content>
        <p> Информация об особенностях, навыках и характеристиках Вашего персонажа должна где-то храниться, для этого
          существует Лист Персонажа. TriP предполагает два способа игры: в духе классических РПГ с бумажными листами,
          или же более современный вариант - с интерактивным листом персонажа в Вашем мобильном устройстве.</p>
        <p> Рекомендуется использовать второй вариант, но с точки зрения игрового процесса никакой разницы нет.
          Электронный лист просто немного удобнее и понятнее на этапе заполнения. </p>
        <faq-sub-block>
          <faq-header @click="openSpoiler">Электронный лист</faq-header>
          <faq-content>
            <p> Инструкции по электронному листу персонажа </p>
          </faq-content>
        </faq-sub-block>
        <faq-sub-block>
          <faq-header @click="openSpoiler">Бумажный лист</faq-header>
          <faq-content>
            <p> Инструкции по бумажному листу персонажа </p>
          </faq-content>
        </faq-sub-block>
      </faq-content>
    </faq-block>


    <p> Сейчас Вы пройдёте через три необходимых шага для создания своего первого персонажа </p>
    <h2>Что нужно знать о Системе?</h2>
    <p>triP построена вокруг трёх основных видов активности - боя, исследования и развития.</p>
    <p> За каждую из этих составляющих отвечает отдельная "ось":</p>
    <ul class="list-disc" pl-4>
      <li> Ось <b>Силы</b> (Power), говорит о том, как персонаж предпочитает решать проблемы и справляться с
        опасностями, от Аспекта <spec-span war>Война</spec-span> до Аспекта <spec-span shadow>Тень</spec-span>. Война
        говорит о прямом подходе, о прямом противостоянии, в том числе на поле боя. Тень же, наоборот, об интригах и
        скрытности, об ударах в спину
      </li>
      <li> Ось <b>Исследования</b> (Pathfinding), описывает фокус персонажа во взаимодействии с миром, от Аспекта
        <spec-span society>Общество</spec-span> до Аспекта <spec-span nature>Природа</spec-span>. Выбирающие Общество
        более внимательны к людским чаяниям и эмоциям, они более проницательны и харизматичны. Те же, кто взял Природу,
        гораздо лучше понимают в неживом, диком, нерукотворном.
      </li>
      <li> Наконец ось <b>Развития</b> (Progress), говорит о подходе персонажа к своему росту. Цивилизация строилась
        Аспектом <spec-span knowledge>Знания</spec-span> который помимо наук и ремёсел включает даже магические
        дисциплины. Но испокон веков кроме того, что мы можем описать словами, теориями и формулами, оставалось и нечто
        скрытое, потаённое и почти необъяснимое, которое мы называем Аспектом <spec-span mystics>Мистика</spec-span>.
        Персонажи с Аспектом Знания должны изучать и анализировать, а взявшие Мистику должны чувствовать, направляя
        поиск внутрь самого себя.
      </li>
    </ul>
    <div flex justify-center class="items-center">
    </div>
  </div>
</template>

<style>
faq-content {
  display: none;
}

.block-open+faq-content {
  display: flex;
  @apply flex-col;
}

.rounded-md-child>* {
  @apply rounded-t-xl;
}

.less-p-child>* {
  @apply px-3 dark:bg-neutral-900/40;
}

@media (min-width: 1024px) {}
</style>
