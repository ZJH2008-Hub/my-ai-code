import random


def play_game():
    """运行一局猜数字游戏。"""
    target = random.randint(1, 100)
    attempts = 0

    print("欢迎来到猜数字游戏！")
    print("我已经生成了一个 1 到 100 之间的整数，请开始猜吧。")

    while True:
        user_input = input("请输入你的猜测（1-100）：").strip()

        try:
            guess = int(user_input)
        except ValueError:
            print("输入无效，请输入一个整数。")
            continue

        if not 1 <= guess <= 100:
            print("数字超出范围，请输入 1 到 100 之间的整数。")
            continue

        attempts += 1

        if guess < target:
            print("小了，再试一次。")
        elif guess > target:
            print("大了，再试一次。")
        else:
            print(f"恭喜你猜对了！数字就是 {target}。")
            print(f"你一共猜了 {attempts} 次。")
            break


if __name__ == "__main__":
    play_game()
