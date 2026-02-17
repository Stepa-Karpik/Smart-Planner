from aiogram.fsm.state import State, StatesGroup


class AddEventStates(StatesGroup):
    waiting_title = State()
    waiting_start = State()
    waiting_end = State()
    waiting_location = State()
    waiting_reminder = State()
    waiting_confirm = State()
