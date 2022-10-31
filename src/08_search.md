# 08: 検索機能とスタイル指定
今回は以下の手順に従って[要求仕様](https://cs-sysdes.github.io/todolist.html)に示された基本仕様 S-1.2 の実装を行います．

1. 検索フォームの設置
2. 検索処理の追加

これまでは新たなページを作成し，ルーティング設定を行なった上で対応する処理を実装する手順で機能拡張を行なってきました．
今回は既存のページにキーワード検索用のフォームを設置し，パスパラメータを用いて検索クエリをサーバへ送信する方法で検索機能の実装を行います．

ここでは特に**タイトルに特定の文字列が含まれるタスク**を検索対象として検索機能を実装します．
すなわち，アプリケーションの動作としてユーザが入力したキーワードをタイトルに含むタスクのみを絞り込んで表示する機能を提供します．


## 検索フォームの設置
検索にヒットしたタスクは一覧表示されることが期待されるので，検索フォームもタスクの一覧表示画面に配置されていると良さそうです．
したがって todolist.go/views/task\_list.html に検索フォームを追加することとします．

<span class="filename">todolist.go/views/task\_list.html</span>
```html
{{ template "header" . }}
<h1>List of tasks</h1>
<form action="/list" method="GET">
    <input type="text" name="kw" value="{{ .Kw }}">
    <input type="submit" value="検索">
</form>
<p><a href="/task/new">新規登録</a></p>
{{ if not .Tasks }}
<p>登録データがありません．</p>
{{ else }}
<table>
    <tr>
        <th>ID</th>
        <th>タイトル</th>
        <th>登録日</th>
        <th>状態</th>
    </tr>
    {{ range $task := .Tasks }}
    <tr>
        <td><a href="/task/{{ $task.ID }}">{{ $task.ID }}</a></td>
        <td>{{ $task.Title }}</td>
        <td>{{ $task.CreatedAt }}</td>
        <td>{{ if $task.IsDone }}済{{ end }}</td>
    </tr>
    {{ end }}
</table>
{{ end }}
{{ template "footer" }}
```

3～6 行目の `<form>` タグが今回追加した検索フォームです．
それ以外の部分はこれまでの実装から変更していません．

3 行目より，設置した検索フォームは GET リクエストを送信します．
このフォームは 4 行目の `<input>` タグで検索キーワードを受け取り，入力されたキーワードを `kw=<入力されたキーワード>` の形式で**リクエストパス**に載せます．
したがって，たとえば「test」などと入力して検索ボタンを押した場合，/list?kw=test をパスとする GET リクエストが送信されることになります．

キーワード入力欄の `<input>` タグには，value 属性として `value="{{ .Kw }}"` を設定しています．
これは検索処理後の画面遷移時に，指定された検索キーワードを入力欄に残しておくために必要です．
この記述は必須ではありませんが，記述しない場合は画面遷移後にキーワード入力欄が空になってしまうため，やや動作としてわかりづらくなります．

検索フォームを設置したので，次に検索処理を実装します．


## 検索処理の追加
設置した検索フォームは本質的に /list に対して GET リクエストを送信するものなので，対応する関数 `service.TaskList` を編集します．
検索機能を実現するために必要な追加処理は以下の 2 つです．

1. パスパラメータから検索キーワードを取得
2. タイトルに検索キーワードを含むタスクのみを絞り込んで表示

Gin フレームワークを使用する場合，`gin.Context.Query` メソッドを使用することでリクエストパスからパスパラメータを取得可能です．
今回は "kw" を key として検索キーワードが渡されるため，`ctx.Query("kw")` を呼び出すことで `TaskList` 関数内で検索キーワードを受け取ります．

タイトルに検索キーワードを含むタスクのみを絞り込むには，i) DB からタスクを全件取得してから条件に一致するタスクのみを抽出する方法，ii) DB から条件に一致するデータのみを取得する方法，の 2 通りが考えられます．
前者 (i) の方法でも悪くはないですが，DB はそもそもこうした操作を得意とするアプリケーションなので，一般には後者 (ii) の方法がより効率的です．
MySQL などにおいてデータの取得条件として特定の文字列を含むもののみを抽出するには "LIKE" 句を使用します．

`service.TaskList` 関数に施す具体的な修正を以下に示します．

<span class="filename">todolist.go/service/task.go</span>
```go
// TaskList renders list of tasks in DB
func TaskList(ctx *gin.Context) {
	// Get DB connection
	db, err := database.GetConnection()
	if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
	}

    // Get query parameter
    kw := ctx.Query("kw")

	// Get tasks in DB
	var tasks []database.Task
    switch {
    case kw != "":
        err = db.Select(&tasks, "SELECT * FROM tasks WHERE title LIKE ?", "%" + kw + "%")
    default:
        err = db.Select(&tasks, "SELECT * FROM tasks")
    }
	if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
	}

	// Render tasks
	ctx.HTML(http.StatusOK, "task_list.html", gin.H{"Title": "Task list", "Tasks": tasks, "Kw": kw})
}
```

修正版の `service.TaskList` 関数では，11 行目でパスパラメータを取得し，指定された検索条件に応じて 15～20 行目で適切な検索クエリを DB へ発行しています．
また，27 行目の画面表示において，変数 `kw` を検索フォームに表示するために追加で指定しています．

17 行目の条件付きデータ取得クエリでは，`WHERE title LIKE '%<kw>%'` を指定することで，"\<kw\>" を部分文字列としてタイトルに含むタスクのみを抽出しています．
キーワード指定時の '%' は任意の 0 文字以上の文字列にマッチする特殊文字です．
'%' を指定し忘れると，部分文字列ではなく正確に "\<kw\>" にマッチするタイトルを持つタスクのみしか拾えなくなる点に注意して下さい．

<div class="memo">
ここで示した修正版 <code class="hljs">service.TaskList</code> 関数では，検索キーワードの有無によってクエリを変更していますが，実は検索キーワードの有無に依存せず 17 行目の記述のみでも問題なく動作します．
というのも，今回は検索キーワードをタイトルに含むタスクのみを抽出するクエリであり，検索キーワードが指定されない場合，すなわち変数 <code class="hljs">kw</code> が空文字の場合には，条件節が <code class="hljs">... WHERE title LIKE '%%'</code> となり，これはどのような文字列に対してもマッチします．
したがって，最終的な結果としては条件を何も指定しない場合と同様になります．

一方で，以下の練習問題のように複数の検索条件を設定する場合には，検索条件の設定に応じて処理を分岐する必要性が出てくるため，ここでは敢えて switch 文による条件分岐を記述しています．
</div>

#### 練習問題 8 (期末レポートに関連)
「完了済みのタスク」や「未完了のタスク」のみを個別に指定する方法を考え，実装してください．
なお，検索フォームに新たなフィールドを付け加えても構いません．


## まとめ
今回は[基本仕様 S-1.2](https://cs-sysdes.github.io/todolist.html) として要求される検索機能を実装しました．

次回から 2 回に分けてログイン機能およびアカウント管理機能を実装し，要求されている基本仕様の実装を一通り完了する予定です．

今回の内容は短いですが以上になります．
お疲れさまでした．
